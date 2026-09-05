/* ═══════════════════════════════════════════════════════════════════════════
   LOCKED PAGE: FUTURISTIC METAL DESIGN
   ═══════════════════════════════════════════════════════════════════════════
   ATTENTION ALL AI AGENTS & DEVELOPERS:
   1. DO NOT revert this page to the legacy plain text / emoji design.
   2. DO NOT overwrite this file with stale code from old sessions.
   3. DO NOT run blanket "Daily update" bulk commits that touch this file.
   4. Keep the shared cinematic showcase and sharp-corner treatment intact.
   ═══════════════════════════════════════════════════════════════════════════ */

import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
// Tiny list module on purpose: importing eggVerifiers.js here would pull 28
// server-side database queries into the client bundle just to print a count.
import { EARNABLE_EGG_COUNT } from '../../src/lib/rewards/eggCoverage';
import { marketplaceCopy } from '../../src/lib/store/marketplaceCopy';

// God-Mode Stack
import supabase from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import { ensureAuthReady, getAccessToken, getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { acquireScrollLock } from '../../src/lib/scrollLock';
import { showStoreToast } from '../../src/components/store/StoreToast';
import { captureStoreEvent } from '../../src/lib/store/storeAnalytics';
import {
  clearCommerceRequestId,
  clearCommerceRequestById,
  getOrCreateCommerceRequestId,
} from '../../src/lib/store/checkoutIntentStore';
import { reconcilePurchasedCart } from '../../src/lib/store/checkoutReconciliation';
import useCartStore from '../../src/stores/cartStore';
import PageTransition from '../../src/components/transitions/PageTransition';
import shellStyles from '../../src/components/diamond-store/DiamondStoreShell.module.css';

const UniversalHeader = dynamic(() => import('../../src/components/ui/UniversalHeader'), {
  ssr: false,
  loading: () => (
    <div
      className={shellStyles.globalHeaderReserve}
      data-marketplace-header-reserve="true"
      aria-hidden="true"
    />
  ),
});
import {
  Gem,
  Crown,
  ShoppingBag,
  Trophy,
  Gamepad2,
  Home,
  Package,
  Wrench,
  Zap,
  Gift,
  ShoppingCart as CartIcon,
  AlertTriangle,
  CheckCircle,
  Trash2,
  CreditCard,
} from 'lucide-react';
const StoreToast = dynamic(() => import('../../src/components/store/StoreToast'), { ssr: false });
import { VIPCard } from '../../src/components/store/StoreCards';
import SmarterStoreShowcase from '../../src/components/diamond-store/SmarterStoreShowcase';
import CheckoutStatusPanel from '../../src/components/diamond-store/CheckoutStatusPanel';
import MarketplaceCommerceNav from '../../src/components/store/MarketplaceCommerceNav';

const MerchStore = dynamic(() => import('../../src/components/store/MerchStore'), {
  loading: () => (
    <div className={shellStyles.loadingPanel} role="status" aria-live="polite">
      Loading Merch Store...
    </div>
  ),
});

import {
  STANDARD_REWARDS,
  EASTER_EGGS,
  DIAMOND_PACKAGES,
  VIP_MEMBERSHIP,
  VIP_BENEFITS,
  MERCHANDISE,
  // Diamond Rewards Standard v2: every economy number below is derived from
  // src/config/diamondRewards.js. Never re-type a cap or a count by hand.
  DAILY_CAP,
  MONTHLY_CAP,
  EASTER_EGG_MONTHLY_CAP,
  biggestEggValue,
  TOTAL_WAYS_TO_EARN,
  TOTAL_EASTER_EGGS,
  EGG_CATEGORY_LABELS,
  EASTER_EGG_COUNTS,
} from '../../src/data/diamondStoreData';
import styles from '../../src/components/diamond-store/diamondStoreStyles';

// VIPCard is shared with the store card library.
// A cold serverless Club Shop request can exceed five seconds even though the
// warmed API completes normally. Keep the request bounded without turning a
// healthy cold start into a false storefront failure.
const CLUB_SHOP_LOAD_TIMEOUT_MS = 12000;

// ───────────────────────────────────────────────────────────────────────────
// DERIVED ECONOMY COPY HELPERS
// 1 diamond = $0.01. The daily cap is measured AFTER the share-streak multiplier,
// so the multiplier makes the cap EASIER TO REACH and never raises it.
// ───────────────────────────────────────────────────────────────────────────
const EGG_CATEGORY_COUNT = Object.keys(EGG_CATEGORY_LABELS).length;
const fmt = (n) => Number(n || 0).toLocaleString('en-US');

// Immutable Rule 7 forbids a bare emoji anywhere in a source file: the SWC
// compiler chokes on one and the Vercel build dies. This page carried ten of
// them in FAQ and cap copy. The compliant form is an escaped surrogate pair,
// declared once here rather than repeated inline -- it renders identically and
// keeps the copy readable.
const GEM = '\uD83D\uDC8E';

// ═══════════════════════════════════════════════════════════════════════════
// STORE TAB ROUTES
// ═══════════════════════════════════════════════════════════════════════════
// Every tab is a real, linkable, indexable URL rather than a piece of component
// state. Navigation stays in the current browser surface, matching the rest of
// the Hub and the installed PWA instead of spawning detached tabs.
//
// The pages under pages/hub/ are thin wrappers that render THIS component with
// an `initialTab` prop, so there is exactly one implementation of the store and
// five addresses into it. The old `?tab=` deep links still work.
export const STORE_TABS = ['diamonds', 'vip', 'merch', 'rewards', 'club-shop'];
const REWARD_TABS = ['overview', 'diamonds', 'eggs'];
const CHECKOUT_STATUS_RETRY_DELAYS = [0, 1200, 2400, 4800];
const CHECKOUT_STATUS_REQUEST_TIMEOUT_MS = 20000;
const CLUB_CARD_PACKAGE_OPTIONS = [
  { packageId: 'micro', diamonds: 100, price: 1 },
  { packageId: 'small', diamonds: 500, price: 5 },
  { packageId: 'medium', diamonds: 1000, price: 10 },
  { packageId: 'standard', diamonds: 2500, price: 25 },
  { packageId: 'large', diamonds: 5000, price: 50 },
  { packageId: 'value', diamonds: 10500, price: 100 },
  { packageId: 'premium', diamonds: 26250, price: 250 },
  { packageId: 'whale', diamonds: 52500, price: 500 },
];

function clubCardTopUpFor(priceInDiamonds) {
  const required = Math.max(1, Number(priceInDiamonds) || 0);
  return (
    CLUB_CARD_PACKAGE_OPTIONS.map((option) => ({
      ...option,
      quantity: Math.ceil(required / option.diamonds),
    }))
      .filter((option) => option.quantity <= 10)
      .sort(
        (a, b) =>
          a.price * a.quantity - b.price * b.quantity ||
          a.diamonds * a.quantity - b.diamonds * b.quantity
      )[0] || null
  );
}

const CLUB_PRODUCT_ATLAS = {
  'VIP Rail Seat (7 Days)': '0% 0%',
  'VIP Rail Seat (7 days)': '0% 0%',
  'Time Bank +30s': '33.333% 0%',
  'Time Bank Bundle (5x)': '66.667% 0%',
  'Snowball Pack (10)': '100% 0%',
  'Tomato Pack (10)': '0% 50%',
  'Golden Egg (3)': '33.333% 50%',
  'Midnight Felt Table Skin': '66.667% 50%',
  'Royal Gold Table Skin': '100% 50%',
  'Classic Emote Pack': '0% 100%',
  'Premium Emote Pack': '33.333% 100%',
  'Shark Avatar': '66.667% 100%',
  'Crown Avatar': '100% 100%',
};

export const TAB_ROUTES = {
  diamonds: '/hub/diamond-store',
  vip: '/hub/vip-membership',
  merch: '/hub/merch-store',
  rewards: '/hub/smarter-rewards',
  'club-shop': '/hub/club-shop',
};

// Five addresses means five tab titles and five meta descriptions. Without
// this, all five routes would share "Diamond Store" and be indistinguishable in
// the browser's tab strip: which is the exact problem opening them in separate
// routes are meant to solve.
export const TAB_META = {
  diamonds: {
    title: 'Diamond Store: Smarter.Poker',
    description: 'Buy Diamonds To Unlock Premium Features Across Smarter.Poker And Club Arena.',
  },
  vip: {
    title: 'VIP Membership: Smarter.Poker',
    description:
      'Everything Included With VIP: Every Premium Day Pass, Higher Diamond Caps, 500 Bonus Diamonds A Month And The Full Club Arena Feature Set.',
  },
  merch: {
    title: 'Merch Store: Smarter.Poker',
    description: 'Official Smarter.Poker Apparel, Card Protectors, Decks And Chip Sets.',
  },
  rewards: {
    title: 'Smarter Rewards: Smarter.Poker',
    description:
      'Every Way To Earn Diamonds, The Real Daily And Monthly Caps, And Every Hidden Achievement.',
  },
  'club-shop': {
    title: 'Club Shop: Smarter.Poker',
    description: 'Spend Diamonds On Time Banks, Cosmetics And Items Your Club Owner Stocks.',
  },
};

const TAB_SOCIAL_IMAGE = {
  diamonds: '/images/store-v3/diamond-vault-hero.webp',
  vip: '/images/store-v3/vip-hero.webp',
  merch: '/images/store-v3/merch-hero.webp',
  rewards: '/images/store-v3/rewards-hero.webp',
  'club-shop': '/images/store-v3/club-shop-hero.webp',
};

const LOWER_SECTION_META = {
  vip: {
    code: 'HIGH LIMIT ACCESS',
    title: 'The Membership Vault',
    description: 'Choose an access tier, review every included system, and activate with card or diamonds.',
  },
  merch: {
    code: 'NEURAL STEEL COLLECTION',
    title: 'The Equipment Gallery',
    description: 'Made-to-order apparel and table gear presented as physical casino hardware.',
  },
  rewards: {
    code: 'VERIFIED REWARD INTELLIGENCE',
    title: 'The Trophy Vault',
    description: 'Live earning caps, streak multipliers, standard rewards, and hidden achievements.',
  },
  'club-shop': {
    code: 'CLUB EQUIPMENT BAY',
    title: 'Outfit The Table',
    description: 'Time banks, table skins, throwables, emotes, avatars, and club-only access.',
  },
};

function storeStructuredData(activeTab) {
  const meta = TAB_META[activeTab] || TAB_META.diamonds;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: meta.title,
    description: meta.description,
    url: `https://smarter.poker${TAB_ROUTES[activeTab]}`,
    image: `https://smarter.poker${TAB_SOCIAL_IMAGE[activeTab]}`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Smarter.Poker',
      url: 'https://smarter.poker/',
    },
  };
}

function RewardDetailLink({ reward, children }) {
  return (
    <Link
      href={`/hub/smarter-rewards/${reward.id}`}
      style={{ color: 'inherit', textDecorationColor: 'rgba(112, 223, 255, 0.55)' }}
    >
      {children}
    </Link>
  );
}

function useDialogFocus(isOpen, dialogRef, onDismiss, isBusy) {
  const returnFocusRef = useRef(null);
  const isBusyRef = useRef(isBusy);

  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const releaseScrollLock = acquireScrollLock('DiamondStoreDialog');
    returnFocusRef.current = document.activeElement;
    const dialog = dialogRef.current;
    dialog?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isBusyRef.current) {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      releaseScrollLock();
      returnFocusRef.current?.focus?.();
    };
  }, [dialogRef, isOpen, onDismiss]);
}

// ═══════════════════════════════════════════════════════════════════════════
// VIP FREQUENTLY ASKED QUESTIONS
// ═══════════════════════════════════════════════════════════════════════════
// Rewritten 2026-08-25. Every answer was checked against the code that runs it.
// Keep these answers aligned with the live VIP Command Center. Self-service
// plan switching and end-of-term cancellation are now wired there; no crypto
// processor is wired or promised.
// House style: first letter of every word is capitalized, per Dan.
const VIP_FAQ = [
  {
    q: 'Can I Cancel Anytime?',
    a: 'Yes. Schedule Cancellation From The VIP Command Center At Any Time And Your Benefits Stay Active Through The End Of The Period You Have Already Paid For. There Is No Cancellation Fee, And No Partial Refund For The Days Remaining.',
  },
  {
    q: 'What Are My Options For Getting VIP?',
    a: 'Three Terms. Monthly Is $19.99 Or 1,999 Diamonds. Yearly Is $199.99 Or 19,999 Diamonds, Which Works Out To Roughly Two Months Free. Lifetime Is $499 Or 49,900 Diamonds And Never Expires. The Rate Is Always 100 Diamonds Per Dollar.',
  },
  {
    q: 'What Happens When My VIP Expires?',
    a: 'Your Account Returns To The Free Tier. Every Diamond You Earned Or Bought Stays Yours Permanently, And So Does Anything You Unlocked Outright. VIP-Gated Features Simply Lock Again Until You Renew.',
  },
  {
    q: 'Do I Keep My 500 Bonus Diamonds?',
    a: 'Yes. Diamonds Credited To Your Balance Are Permanently Yours, Monthly VIP Stipends Included, Even After The Membership Ends. The Stipend Is Credited To Active Monthly And Yearly Subscriptions.',
  },
  {
    q: 'Does A New Term Stack With The One I Have?',
    a: 'Yes. Buying Monthly Or Yearly While You Already Have VIP Extends Your Existing Expiry Rather Than Overwriting It, And You Keep The Longer Of The Two Terms. Lifetime Replaces Any Expiry With None At All.',
  },
  {
    q: 'Is Everything Truly Unlimited, Or Are There Caps?',
    a: 'Most Of It Is Unlimited. Three Perks Carry An Honest Monthly Ceiling: 100 Free Rabbit Hunts, 500 Free Throwables, And 120 Extra Time Bank Seconds. Past Those You Pay The Normal Diamond Price. We List The Real Number Rather Than The Word Unlimited.',
  },
  {
    q: 'How Much Higher Are My Diamond Earning Caps?',
    a: 'VIP Raises Your Daily Earning Cap From 110 To 150 Diamonds, And Your Monthly Cap From 3,300 To 4,500. Share-Streak Multipliers Make Those Caps Easier To Reach, But They Never Raise Them.',
  },
  {
    q: 'Does One Membership Cover Both Smarter.Poker And Club Arena?',
    a: 'Yes. A Single Membership Covers The Whole Platform. The Same Account Session Carries Your VIP Status Into Club Arena, Diamond Arena And Every Training Tool, With Nothing Extra To Activate.',
  },
  {
    q: 'Do I Still Pay Tournament Buy-Ins As A VIP?',
    a: 'Yes. VIP Waives Diamond Costs On Training Games, Trivia Entries And Table Features. Tournament Buy-Ins And Entry Fees Are A Separate Thing, And Are Still Charged Normally.',
  },
  {
    q: 'Can I Switch Between Monthly And Yearly?',
    a: 'Yes. Switch Plans From The VIP Command Center Without Leaving The Marketplace. Your Renewal Date Stays In Place And Stripe Applies Unused Paid Time As A Prorated Credit To The Next Invoice.',
  },
  {
    q: 'What Payment Methods Are Accepted?',
    a: 'All Major Credit And Debit Cards Through Our Secure Stripe Checkout, Including Apple Pay And Google Pay Where Your Device Supports Them. You Can Also Pay Entirely In Diamonds: 1,999 Diamond Monthly, 19,999 Yearly, Or 49,900 Lifetime.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export default function DiamondStorePage({ initialTab }) {
  useTrainingBus('diamond-store');
  const router = useRouter();

  // Persisted filters. `activeTab` is deliberately NOT one of them any more.
  //
  // It used to be, and that was correct while the store was a single URL with
  // five tabs of component state. It stopped being correct the moment each tab
  // became its own address: `usePersistedFilters` hydrates from a localStorage
  // entry with a 30-DAY TTL, so a member who last looked at the VIP tab would
  // open /hub/diamond-store and be shown VIP: under a tab titled "Diamond
  // Store", with a diamond-store URL to share and diamond-store meta in the
  // head. The URL and the screen disagreed, and the URL was the one thing the
  // user actually chose.
  //
  // The route is now the single source of truth for which tab is shown. A
  // pre-existing `activeTab` key left in a browser's storage is simply never
  // read again: no migration needed, it ages out on its own TTL.
  //
  // `rewardsSubTab` stays persisted: that is a sub-view WITHIN one page, it has
  // no URL of its own, and remembering it is the behaviour people want.
  const { filters, setFilter } = usePersistedFilters('diamond-store', {
    rewardsSubTab: 'overview',
  });

  const activeTab = initialTab || 'diamonds';
  const rewardsSubTab = filters.rewardsSubTab;
  const setRewardsSubTab = (val) => setFilter('rewardsSubTab', val);
  const handleRewardsTabKeyDown = (event, currentTab) => {
    const currentIndex = REWARD_TABS.indexOf(currentTab);
    let nextIndex = null;

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % REWARD_TABS.length;
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + REWARD_TABS.length) % REWARD_TABS.length;
    }
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = REWARD_TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = REWARD_TABS[nextIndex];
    setRewardsSubTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`rewards-tab-${nextTab}`)?.focus());
  };

  const [selectedVIP, setSelectedVIP] = useState('vip-monthly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [busyPackageId, setBusyPackageId] = useState(null);
  // React state does not update synchronously. This ref closes the few-
  // millisecond double-tap window before a disabled button can render.
  const processingRef = useRef(false);
  const setStoreProcessing = useCallback((nextValue) => {
    processingRef.current = nextValue;
    setIsProcessing(nextValue);
    if (!nextValue) setBusyPackageId(null);
  }, []);
  const [isVip, setIsVip] = useState(false);
  // `is_vip` alone cannot render an honest membership card: it says THAT you
  // are a member, not which tier or until when. Both are read below.
  const [vipTier, setVipTier] = useState(null);
  const [vipExpiresAt, setVipExpiresAt] = useState(null);
  const [diamondBalance, setDiamondBalance] = useState(null);
  // Replaces native confirmation dialogs on the two paths that spend diamonds. A native
  // confirm blocks the whole tab, cannot be styled, and on iOS standalone PWAs
  // is easy to miss entirely. `pending` also carries the idempotency key so a
  // double-tap on Confirm reuses one key instead of minting a second purchase.
  const [pendingSpend, setPendingSpend] = useState(null);
  const [diamondMultiplier, setDiamondMultiplier] = useState(1.0);
  const [checkoutReturn, setCheckoutReturn] = useState(null);
  const [checkoutVerificationAttempt, setCheckoutVerificationAttempt] = useState(0);
  const cartOwnerId = useCartStore((state) => state.ownerId);
  const reconciledCheckoutSessionsRef = useRef(new Set());

  useEffect(() => {
    if (!router.isReady || activeTab !== 'vip') return;
    const requestedPlan = Array.isArray(router.query.plan) ? router.query.plan[0] : router.query.plan;
    if (['vip-monthly', 'vip-yearly', 'vip-lifetime'].includes(requestedPlan)) {
      setSelectedVIP(requestedPlan);
    }
  }, [activeTab, router.isReady, router.query.plan]);

  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);

  // ═══ Club Shop State ═══
  const [clubShopItems, setClubShopItems] = useState([]);
  const [clubShopPurchases, setClubShopPurchases] = useState([]);
  const [clubDiamondBalance, setClubDiamondBalance] = useState(0);
  const [clubShopLoading, setClubShopLoading] = useState(false);
  const [clubShopLoaded, setClubShopLoaded] = useState(false);
  const [clubShopBuyTarget, setClubShopBuyTarget] = useState(null);
  const [clubShopProcessing, setClubShopProcessing] = useState(false);
  const [clubShopCardProcessingId, setClubShopCardProcessingId] = useState(null);
  const [clubShopError, setClubShopError] = useState(null);
  const [clubShopCategory, setClubShopCategory] = useState('All');
  const [clubShopSearch, setClubShopSearch] = useState('');
  const [clubShopSubTab, setClubShopSubTab] = useState('store');
  const [clubShopClubId, setClubShopClubId] = useState(null);
  const [clubShopRole, setClubShopRole] = useState('player');
  const [clubShopSuccess, setClubShopSuccess] = useState(null);
  const [clubShopSortMode, setClubShopSortMode] = useState('newest');
  // Admin Manage state
  const [clubShopAdminItems, setClubShopAdminItems] = useState([]);
  const [clubShopAdminLoaded, setClubShopAdminLoaded] = useState(false);
  const [clubShopAdminLoading, setClubShopAdminLoading] = useState(false);
  const [clubShopAdminError, setClubShopAdminError] = useState(null);
  const [clubShopAdminReport, setClubShopAdminReport] = useState(null);
  const [clubShopNewName, setClubShopNewName] = useState('');
  const [clubShopNewPrice, setClubShopNewPrice] = useState('');
  const [clubShopNewDesc, setClubShopNewDesc] = useState('');
  const [clubShopNewCategory, setClubShopNewCategory] = useState('Time Banks');
  const [clubShopNewImage, setClubShopNewImage] = useState('');
  const [clubShopLastCreate, setClubShopLastCreate] = useState(0);
  const [clubShopDeleteTarget, setClubShopDeleteTarget] = useState(null);
  const [clubShopAdminActionId, setClubShopAdminActionId] = useState(null);
  const clubShopLoadingRef = useRef(false);
  // The storefront loader can be invalidated by its timeout or a later retry.
  // A superseded request must never clear or overwrite the newer request's
  // terminal state when its network work eventually settles.
  const clubShopLoadRequestRef = useRef(0);
  const clubShopLoadTimerRef = useRef(null);
  const clubShopProcessingRef = useRef(false);
  const clubShopAdminLoadingRef = useRef(false);
  const clubShopAdminAbortRef = useRef(null);
  const clubShopAdminActionRef = useRef(null);
  const clubShopSuccessTimerRef = useRef(null);
  const pendingSpendDialogRef = useRef(null);
  const clubShopDialogRef = useRef(null);
  const clubShopDeleteDialogRef = useRef(null);
  const dismissPendingSpend = useCallback(() => setPendingSpend(null), []);
  const dismissClubShopDialog = useCallback(() => setClubShopBuyTarget(null), []);
  const dismissClubShopDeleteDialog = useCallback(() => {
    if (!clubShopAdminActionRef.current) setClubShopDeleteTarget(null);
  }, []);
  const setClubProcessing = useCallback((nextValue) => {
    clubShopProcessingRef.current = nextValue;
    setClubShopProcessing(nextValue);
  }, []);
  const setClubShopAdminAction = useCallback((itemId) => {
    clubShopAdminActionRef.current = itemId;
    setClubShopAdminActionId(itemId);
  }, []);

  useDialogFocus(!!pendingSpend, pendingSpendDialogRef, dismissPendingSpend, isProcessing);
  useDialogFocus(!!clubShopBuyTarget, clubShopDialogRef, dismissClubShopDialog, clubShopProcessing);
  useDialogFocus(
    !!clubShopDeleteTarget,
    clubShopDeleteDialogRef,
    dismissClubShopDeleteDialog,
    !!clubShopAdminActionId
  );

  // LEGACY DEEP LINKS: /hub/diamond-store?tab=<tabId>
  //
  // Those links are years old and live in bookmarks, emails and old posts, so
  // they must keep working. They are now REDIRECTED to the tab's own URL rather
  // than quietly switching a tab behind a diamond-store address: the visitor
  // ends up somewhere with the right title, the right meta description and a
  // URL they can copy and share correctly.
  //
  // `router.replace` rather than `push` so the Back button returns to wherever
  // they came from instead of bouncing off the redirect. No loop is possible :
  // the destination renders with `initialTab` set, and this effect returns on
  // its first line when that is true.
  useEffect(() => {
    if (!router.isReady) return;
    if (initialTab) return;
    const raw = router.query.tab;
    const tab = Array.isArray(raw) ? raw[0] : raw;
    if (typeof tab !== 'string' || !STORE_TABS.includes(tab)) return;
    if (tab === 'diamonds') {
      // Already the right page; just drop the redundant query string.
      router.replace(TAB_ROUTES.diamonds, undefined, { shallow: true });
      return;
    }
    router.replace(TAB_ROUTES[tab]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, initialTab, router.query.tab]);

  // A Stripe return URL is only a transport signal. `success=true` is never
  // trusted on its own: the server retrieves the session from Stripe, verifies
  // ownership, and compares the backing store record before this page claims
  // a completed purchase.
  useEffect(() => {
    if (!router.isReady) return undefined;

    const clearCheckoutTransport = () => {
      const cleanPath = TAB_ROUTES[activeTab];
      window.history.replaceState(
        { ...window.history.state, as: cleanPath, url: cleanPath },
        '',
        cleanPath
      );
    };

    const rawCanceled = Array.isArray(router.query.canceled)
      ? router.query.canceled[0]
      : router.query.canceled;
    const rawSuccess = Array.isArray(router.query.success)
      ? router.query.success[0]
      : router.query.success;
    const rawSession = Array.isArray(router.query.session_id)
      ? router.query.session_id[0]
      : router.query.session_id;

    if (rawCanceled === 'true') {
      setCheckoutReturn({ status: 'canceled' });
      captureStoreEvent('checkout_canceled', { route: activeTab });
      clearCheckoutTransport();
      return undefined;
    }

    if (rawSuccess !== 'true' || typeof rawSession !== 'string') return undefined;

    let cancelled = false;
    let retryTimer = null;
    const controller = new AbortController();
    setCheckoutReturn({ status: 'verifying', sessionId: rawSession });
    // Remove the transport parameters before any network work so a Stripe
    // session reference never lingers in copied URLs, analytics, or referrers.
    clearCheckoutTransport();
    const token = getAccessToken();
    if (!token) {
      setCheckoutReturn({
        status: 'failed',
        sessionId: rawSession,
        message: 'Sign In To Verify This Checkout And View Its Receipt.',
      });
      return undefined;
    }

    (async () => {
      try {
        let pendingWasReported = false;

        for (let attempt = 0; attempt < CHECKOUT_STATUS_RETRY_DELAYS.length; attempt += 1) {
          const delay = CHECKOUT_STATUS_RETRY_DELAYS[attempt];
          if (delay > 0) {
            await new Promise((resolve) => {
              retryTimer = window.setTimeout(resolve, delay);
              controller.signal.addEventListener('abort', resolve, { once: true });
            });
          }
          if (cancelled || controller.signal.aborted) return;

          let response;
          const requestController = new AbortController();
          const abortRequest = () => requestController.abort();
          controller.signal.addEventListener('abort', abortRequest, { once: true });
          let requestTimedOut = false;
          const requestTimer = window.setTimeout(() => {
            requestTimedOut = true;
            requestController.abort();
          }, CHECKOUT_STATUS_REQUEST_TIMEOUT_MS);
          try {
            response = await fetch(
              `/api/store/checkout-status?session_id=${encodeURIComponent(rawSession)}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                signal: requestController.signal,
              }
            );
          } catch (error) {
            if (cancelled || controller.signal.aborted) return;
            if (error?.name === 'AbortError' && requestTimedOut) {
              if (attempt < CHECKOUT_STATUS_RETRY_DELAYS.length - 1) continue;
              throw new Error('Checkout Verification Timed Out. Try Verification Again.');
            }
            if (error?.name === 'AbortError') return;
            if (attempt < CHECKOUT_STATUS_RETRY_DELAYS.length - 1) continue;
            throw error;
          } finally {
            window.clearTimeout(requestTimer);
            controller.signal.removeEventListener('abort', abortRequest);
          }

          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.success) {
            throw new Error(body?.error || 'Could Not Verify Checkout Status.');
          }
          if (cancelled) return;

          const status = ['complete', 'failed'].includes(body.data?.status)
            ? body.data.status
            : 'pending';
          const needsRedemptionReview = body.data?.redemptionStatus === 'needs_review';
          setCheckoutReturn({
            status,
            sessionId: rawSession,
            receipt: body.data,
            ...(needsRedemptionReview ? {
              message: 'Your Card Payment And Diamonds Are Recorded, But The Item Was Not Purchased. Your Diamonds Remain Available: Buy The Item Separately Without Paying By Card Again.',
            } : {}),
          });
          if (status === 'complete') {
            captureStoreEvent('checkout_complete', {
              route: activeTab,
              type: body.data?.type || 'unknown',
              payment_status: body.data?.paymentStatus || 'unknown',
              verification_attempts: attempt + 1,
            });
            return;
          }

          if (!pendingWasReported) {
            pendingWasReported = true;
            captureStoreEvent('checkout_pending', {
              route: activeTab,
              type: body.data?.type || 'unknown',
              payment_status: body.data?.paymentStatus || 'unknown',
            });
          }
        }
      } catch (error) {
        if (cancelled) return;
        setCheckoutReturn({
          status: 'failed',
          sessionId: rawSession,
          message: error.message,
        });
        captureStoreEvent('checkout_verification_failed', { route: activeTab });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [
    activeTab,
    router.isReady,
    router.query.canceled,
    router.query.session_id,
    router.query.success,
    checkoutVerificationAttempt,
  ]);

  useEffect(() => {
    captureStoreEvent('viewed', { route: activeTab });
  }, [activeTab]);

  useEffect(() => {
    if (checkoutReturn?.status === 'complete' && user?.id && checkoutReturn.receipt?.requestId) {
      clearCommerceRequestById({
        userId: user.id,
        paymentMethod: 'card',
        requestId: checkoutReturn.receipt.requestId,
      });
    }
  }, [checkoutReturn?.receipt?.requestId, checkoutReturn?.status, user?.id]);

  // A verified owner-scoped receipt is the only signal allowed to remove paid
  // cart quantities. Exact server-resolved lines preserve anything added or
  // increased while Stripe Checkout was open.
  useEffect(() => {
    if (checkoutReturn?.status !== 'complete' || !user?.id) return;
    const sessionId = checkoutReturn.receipt?.sessionId;
    const purchasedLines = checkoutReturn.receipt?.cartItems;
    if (
      !sessionId
      || !Array.isArray(purchasedLines)
      || purchasedLines.length === 0
      || cartOwnerId !== user.id
      || reconciledCheckoutSessionsRef.current.has(sessionId)
    ) return;

    const cartStore = useCartStore.getState();
    const reconciled = reconcilePurchasedCart(cartStore.items, purchasedLines);
    if (reconciled !== cartStore.items) cartStore.setItems(reconciled);
    reconciledCheckoutSessionsRef.current.add(sessionId);
  }, [cartOwnerId, checkoutReturn?.receipt, checkoutReturn?.status, user?.id]);

  // Clear any pending club-shop success-toast timer on unmount
  useEffect(
    () => () => {
      if (clubShopSuccessTimerRef.current) clearTimeout(clubShopSuccessTimerRef.current);
      if (clubShopLoadTimerRef.current) clearTimeout(clubShopLoadTimerRef.current);
      clubShopLoadRequestRef.current += 1;
      clubShopLoadingRef.current = false;
    },
    []
  );

  // Check VIP status on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Supabase may still be hydrating its persisted session on a cold load.
        // Wait for the supported readiness chain before deciding this is a
        // signed-out storefront for the rest of the page session. Until this
        // resolves, MerchStore must not downgrade an owner-bound persisted cart
        // to "guest" and erase it during the first client render.
        const authUser = getAuthUser() || (await ensureAuthReady(supabase));
        if (cancelled) return;
        if (authUser?.id) {
          setUser(authUser);
          const { data: profile } = await supabase
            .from('profiles')
            .select('is_vip, vip_tier, vip_expires_at, diamonds, diamond_multiplier')
            .eq('id', authUser.id)
            .maybeSingle();
          if (cancelled) return;
          setIsVip(!!profile?.is_vip);
          setVipTier(profile?.vip_tier || null);
          setVipExpiresAt(profile?.vip_expires_at || null);
          if (profile?.diamonds != null) setDiamondBalance(Number(profile.diamonds));
          if (profile?.diamond_multiplier) setDiamondMultiplier(Number(profile.diamond_multiplier));
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[DiamondStore] Authentication readiness failed:', error?.message || error);
        }
      } finally {
        if (!cancelled) setAuthResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Realtime subscription: live updates (read actual VIP status from payload)
  useEffect(() => {
    if (!user?.id) return;
    const _ch = supabase
      .channel(`dstore:${user?.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user?.id}` },
        (payload) => {
          if (payload.new?.is_vip !== undefined) {
            setIsVip(!!payload.new.is_vip);
          }
          if (payload.new?.diamond_multiplier !== undefined) {
            setDiamondMultiplier(Number(payload.new.diamond_multiplier));
          }
          if (payload.new?.vip_tier !== undefined) {
            setVipTier(payload.new.vip_tier || null);
          }
          if (payload.new?.vip_expires_at !== undefined) {
            setVipExpiresAt(payload.new.vip_expires_at || null);
          }
          if (payload.new?.diamonds !== undefined) {
            setDiamondBalance(Number(payload.new.diamonds));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(_ch);
    };
  }, [user?.id]);

  // Cross-tab diamond purchase sync: refresh balance when another tab purchases
  useEffect(() => {
    let cancelled = false;
    const cleanup = listenBroadcast('smarter_poker_diamond_sync', () => {
      // Another tab changed the shared wallet or membership. Refresh every
      // field this page renders so its balance and entitlement card cannot
      // drift independently.
      if (user?.id) {
        supabase
          .from('profiles')
          .select('is_vip, vip_tier, vip_expires_at, diamonds, diamond_multiplier')
          .eq('id', user.id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              console.warn('[Diamond Store] VIP refresh failed:', error.message || error);
              return;
            }
            if (!cancelled && data) {
              setIsVip(!!data.is_vip);
              setVipTier(data.vip_tier || null);
              setVipExpiresAt(data.vip_expires_at || null);
              if (data.diamonds != null) setDiamondBalance(Number(data.diamonds));
              if (data.diamond_multiplier != null) {
                setDiamondMultiplier(Number(data.diamond_multiplier));
              }
            }
          });
      }
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [user?.id]);

  const handleDirectCheckout = async (pkg) => {
    if (processingRef.current) return;
    setBusyPackageId(pkg.id);
    setStoreProcessing(true);
    try {
      const token = getAccessToken();
      if (!token || !user?.id) {
        showStoreToast('error', 'Please sign in to complete your purchase');
        setStoreProcessing(false);
        return;
      }
      const checkoutRequestId = getOrCreateCommerceRequestId({
        scope: `diamonds-${pkg.id}`,
        userId: user.id,
        paymentMethod: 'card',
        intent: { packageId: pkg.id, quantity: 1 },
      });
      captureStoreEvent('checkout_started', {
        route: 'diamonds',
        type: 'diamonds',
        product: pkg.id,
        value_usd: Number(pkg.price || 0),
      });
      showStoreToast('success', 'Redirecting to secure checkout...');
      const response = await fetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: String(pkg.id || '').replace(/^diamond-/, ''), quantity: 1 }],
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error?.message || `Request failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success)
        throw new Error(data.error?.message || 'Failed to create checkout session');
      if (!data.data?.url) throw new Error('Checkout session missing redirect URL');
      captureStoreEvent('checkout_session_created', {
        route: 'diamonds',
        type: 'diamonds',
        product: pkg.id,
      });
      window.location.href = data.data.url;
    } catch (err) {
      captureStoreEvent('checkout_failed', { route: 'diamonds', type: 'diamonds' });
      showStoreToast('error', err.message || 'Purchase failed');
      setStoreProcessing(false);
    }
  };

  // VIP subscription: the daily pass is bought with diamonds, the monthly and
  // annual tiers go straight to a Stripe Checkout subscription session.
  // VIP subscription: monthly and yearly go straight to a Stripe Checkout
  // subscription session. Lifetime is a one-time term whose card path is not
  // built, so the primary button routes it to the diamond purchase instead of
  // a checkout that would refuse it.
  const handleVIPSubscribe = async () => {
    if (processingRef.current) return;
    if (vipTier === 'lifetime') {
      showStoreToast('success', 'Lifetime VIP Already Includes Every VIP Plan.');
      return;
    }
    const plan = selectedVIPPlan;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }

    if (plan?.cardCheckoutReady === false) {
      if (!user?.id) {
        showStoreToast('error', 'Please Sign In To Purchase VIP.');
        return;
      }
      const cost = Math.round(Number(plan.price) * 100);
      const commerceIntent = {
        scope: 'vip-lifetime',
        userId: user.id,
        paymentMethod: 'diamonds',
        intent: { plan: 'lifetime' },
      };
      setPendingSpend({
        kind: 'plan',
        planKey: 'lifetime',
        title: 'Buy Lifetime VIP With Diamonds',
        cost,
        detail:
          `${cost.toLocaleString()} Diamonds, Once. Your Membership Stops Having An Expiry Date Rather Than Getting A Longer One, And It Never Renews.`,
        commerceIntent,
        idempotencyKey: getOrCreateCommerceRequestId(commerceIntent),
      });
      return;
    }

    await startStripeCheckout(plan);
  };

  /* REMOVED 2026-09-05 with the Daily Pass: runDailyPassPurchase (the
     150-diamond 24-hour buy) and handleDailyVipCardCheckout (the card-funded
     version, which bought the smallest sufficient diamond package and
     auto-redeemed 150 of them through a `vip_daily` redemption intent).
     Dan: the terms are monthly, yearly and lifetime. Nothing was ever sold on
     the Daily Pass - 0 vip_daily diamond transactions and 0 purchases carrying
     that intent - so no receipt, refund or in-flight settlement depends on
     either function. /api/store/purchase-daily-vip is deleted too.
     order-ledger.js and diamond-liability.js still recognise the `vip_daily`
     transaction type on purpose: they read history, and history does not
     change because a product was retired. */

  const runDiamondPlanPurchase = async (planKey, idempotencyKey, commerceIntent) => {
    if (processingRef.current) return;
    if (vipTier === 'lifetime') {
      clearCommerceRequestId(commerceIntent);
      showStoreToast('success', 'Lifetime VIP Already Includes This Membership.');
      return true;
    }
    const token = getAccessToken();
    if (!token || !user?.id) {
      showStoreToast('error', 'Please sign in to purchase VIP.');
      return;
    }
    setStoreProcessing(true);
    try {
      captureStoreEvent('diamond_purchase_started', {
        route: 'vip',
        product: planKey,
      });
      const res = await fetch('/api/store/purchase-vip-with-diamonds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ plan: planKey }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // The API returns required/current on a shortfall: say the number
        // rather than a bare failure the member cannot act on.
        const short =
          data?.required != null && data?.current != null
            ? ` You Need ${Number(data.required).toLocaleString()} And Have ${Number(data.current).toLocaleString()}.`
            : '';
        throw new Error(`${data?.error || `Request Failed (${res.status})`}.${short}`);
      }
      if (data?.success) {
        clearCommerceRequestId(commerceIntent);
        captureStoreEvent('diamond_purchase_complete', {
          route: 'vip',
          product: planKey,
          diamonds_spent: Number(data.cost || 0),
        });
        showStoreToast(
          'success',
          data.duplicate
            ? 'That Purchase Was Already Applied. Your Membership Is Active.'
            : `VIP Active. ${Number(data.daysAdded || 0).toLocaleString()} Days Added.`
        );
        setIsVip(true);
        if (data.tier) setVipTier(data.tier);
        if (data.expiresAt) setVipExpiresAt(data.expiresAt);
        if (data.newBalance != null) setDiamondBalance(Number(data.newBalance));
        broadcastSync('smarter_poker_vip_sync', 'refresh_vip');
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        return true;
      } else {
        showStoreToast('error', data?.error || 'VIP Purchase Failed.');
        return false;
      }
    } catch (e) {
      captureStoreEvent('diamond_purchase_failed', { route: 'vip', product: planKey });
      showStoreToast('error', e.message);
      return false;
    } finally {
      setStoreProcessing(false);
    }
  };

  /** Stripe Checkout, subscription mode, for the cash plans. */
  const startStripeCheckout = async (plan) => {
    if (processingRef.current) return;
    // Only the plan key is sent; the server resolves the Stripe price ID from
    // its own env config, so the price is never client-controlled.
    const token = getAccessToken();
    if (!token || !user?.id) {
      showStoreToast('error', 'Please sign in to subscribe to VIP.');
      return;
    }

    setStoreProcessing(true);
    try {
      const checkoutRequestId = getOrCreateCommerceRequestId({
        scope: `vip-${plan.id}`,
        userId: user.id,
        paymentMethod: 'card',
        intent: { plan: plan.id },
      });
      captureStoreEvent('checkout_started', {
        route: 'vip',
        type: 'subscription',
        product: plan.id,
        value_usd: Number(plan.price || 0),
      });
      const response = await fetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        body: JSON.stringify({
          type: 'subscription',
          items: [{ plan: plan.id }],
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error?.message || `Request failed (${response.status})`);
      }
      if (!data.data?.url) {
        throw new Error('Checkout session missing redirect URL');
      }

      captureStoreEvent('checkout_session_created', {
        route: 'vip',
        type: 'subscription',
        product: plan.id,
      });
      // Redirect to Stripe Checkout (isProcessing stays true through nav)
      window.location.href = data.data.url;
    } catch (error) {
      console.warn('VIP subscription error:', error);
      captureStoreEvent('checkout_failed', { route: 'vip', type: 'subscription' });
      showStoreToast('error', error.message || 'Failed to start VIP checkout. Please try again.');
      setStoreProcessing(false);
    }
  };

  // Merchandise checkout lives in src/components/store/MerchStore.jsx: it talks
  // to /api/store/create-checkout-session (card) and /api/store/purchase-with-diamonds
  // (diamonds) directly, so the page no longer needs a merch purchase handler.

  // ═══ Club Shop: Load items from marketplace API ═══
  const loadClubShop = useCallback(
    async (silent = false) => {
      if (clubShopLoadingRef.current) return;
      const requestId = ++clubShopLoadRequestRef.current;
      clubShopLoadingRef.current = true;
      if (!silent) setClubShopLoading(true);
      if (!silent) setClubShopError(null);
      const loadController = new AbortController();
      const loadTimer = setTimeout(() => {
        if (requestId !== clubShopLoadRequestRef.current) return;
        clubShopLoadRequestRef.current += 1;
        clubShopLoadingRef.current = false;
        loadController.abort();
        if (!silent) {
          setClubShopLoading(false);
          setClubShopLoaded(true);
          setClubShopError('The Club Shop Timed Out. Please Try Again.');
        }
      }, CLUB_SHOP_LOAD_TIMEOUT_MS);
      clubShopLoadTimerRef.current = loadTimer;
      try {
        const token = getAccessToken();
        if (!token) {
          clubShopLoadingRef.current = false;
          setClubShopLoading(false);
          setClubShopLoaded(true);
          return;
        }
        // Resolve membership on the server. Direct browser-to-Supabase membership
        // reads can be delayed or blocked independently of the authenticated API,
        // which previously left the storefront unusable even while Orders worked.
        const query = clubShopClubId ? `?clubId=${encodeURIComponent(clubShopClubId)}` : '';
        const response = await fetch(`/api/club-arena/marketplace-items${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: loadController.signal,
        });
        if (requestId !== clubShopLoadRequestRef.current) return;
        if (!response.ok) throw new Error(`Failed to load club shop (${response.status})`);
        const data = await response.json();
        if (requestId !== clubShopLoadRequestRef.current) return;
        if (!data?.success) throw new Error(data?.error || 'Failed to load club shop');
        const targetClub = data.clubId || null;
        if (targetClub) setClubShopClubId(targetClub);

        setClubShopError(null);
        setClubShopItems(
          (data.items || []).map((i) => ({
            ...i,
            club_id: targetClub,
            name: marketplaceCopy(i.name),
            description: marketplaceCopy(i.description),
            category: marketplaceCopy(i.category),
            is_active: true,
            price: Number(i.price) || 0,
            purchase_count: i.purchase_count || 0,
          }))
        );
        setClubShopPurchases(data.purchases || []);
        setClubDiamondBalance(data.balance || 0);
        if (data.role) setClubShopRole(data.role);
        setClubShopLoaded(true);
      } catch (err) {
        if (requestId !== clubShopLoadRequestRef.current) return;
        console.warn('[Club Shop]', err);
        if (!silent) {
          setClubShopError('The Club Shop Could Not Be Loaded. Please Try Again.');
          setClubShopLoaded(true);
          showStoreToast('error', 'Failed to load the club shop. Please try again.');
        }
      } finally {
        clearTimeout(loadTimer);
        if (clubShopLoadTimerRef.current === loadTimer) clubShopLoadTimerRef.current = null;
        if (requestId === clubShopLoadRequestRef.current) {
          clubShopLoadingRef.current = false;
          setClubShopLoading(false);
        }
      }
    },
    [clubShopClubId]
  );

  // ═══ Club Shop: Purchase handler ═══
  const handleClubPurchase = async (purchaseTarget = clubShopBuyTarget) => {
    const targetClubId = purchaseTarget?.clubId || purchaseTarget?.club_id || clubShopClubId;
    if (!purchaseTarget || !targetClubId || clubShopProcessingRef.current) return;
    setClubProcessing(true);
    try {
      captureStoreEvent('club_purchase_started', {
        route: 'club-shop',
        product: purchaseTarget.id,
        diamonds_spent: Number(purchaseTarget.price || 0),
        currency: 'diamonds',
      });
      const token = getAccessToken();
      if (!token) throw new Error('Not authenticated');

      const idempotencyKey = purchaseTarget.purchaseRequestId;
      const response = await fetch('/api/club-arena/marketplace-purchase', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({ clubId: targetClubId, itemId: purchaseTarget.id }),
      });
      const responseData = await response
        .json()
        .catch(() => ({ success: false, error: `HTTP ${response.status}` }));
      if (!responseData.success) throw new Error(responseData.error || 'Purchase failed');

      const pricePaid = Number(responseData.pricePaid ?? purchaseTarget.price) || 0;
      clearCommerceRequestId(purchaseTarget.commerceIntent);
      captureStoreEvent('club_purchase_complete', {
        route: 'club-shop',
        product: purchaseTarget.id,
        diamonds_spent: pricePaid,
        currency: responseData.currency || 'diamonds',
      });
      setClubShopSuccess(
        `Purchased ${purchaseTarget.name} For ${pricePaid.toLocaleString()} Diamonds!`
      );
      if (clubShopSuccessTimerRef.current) clearTimeout(clubShopSuccessTimerRef.current);
      clubShopSuccessTimerRef.current = setTimeout(() => setClubShopSuccess(null), 2500);
      setClubDiamondBalance(responseData.newBalance ?? clubDiamondBalance - pricePaid);
      // The Club Shop spends the platform diamond wallet, so notify the same
      // cross-tab channel as every other diamond purchase.
      broadcastSync('smarter_poker_diamond_sync', 'refresh');
      setClubShopBuyTarget(null);
      clubShopLoadingRef.current = false;
      loadClubShop(true);
    } catch (err) {
      captureStoreEvent('club_purchase_failed', { route: 'club-shop' });
      showStoreToast('error', err.message || 'Purchase failed');
    } finally {
      setClubProcessing(false);
    }
  };

  const handleClubCardCheckout = async (item) => {
    if (!item || clubShopCardProcessingId || clubShopProcessingRef.current) return;
    const token = getAccessToken();
    if (!token || !user?.id || !clubShopClubId) {
      showStoreToast('error', 'Please Sign In To Buy Club Shop Items.');
      return;
    }
    const topUp = clubCardTopUpFor(item.price);
    if (!topUp) {
      showStoreToast('error', 'This Item Is Above The Current Card Checkout Limit.');
      return;
    }
    const checkoutRequestId = getOrCreateCommerceRequestId({
      scope: `club-card-${item.id}`,
      userId: user.id,
      paymentMethod: 'card',
      intent: { clubId: clubShopClubId, itemId: item.id },
    });
    setClubShopCardProcessingId(item.id);
    try {
      captureStoreEvent('checkout_started', {
        route: 'club-shop',
        type: 'card-funded-item',
        product: item.id,
        value_usd: topUp.price * topUp.quantity,
      });
      const origin = window.location.origin;
      const response = await fetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: topUp.packageId, quantity: topUp.quantity }],
          redemptionIntent: { kind: 'club_shop', clubId: clubShopClubId, itemId: item.id },
          successUrl: `${origin}${TAB_ROUTES['club-shop']}?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}${TAB_ROUTES['club-shop']}?canceled=true`,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success || !data?.data?.url) {
        throw new Error(data?.error?.message || 'Could Not Start Card Checkout.');
      }
      window.location.href = data.data.url;
    } catch (error) {
      setClubShopCardProcessingId(null);
      showStoreToast('error', error.message || 'Could Not Start Card Checkout.');
    }
  };

  useEffect(() => {
    if (activeTab !== 'club-shop' || checkoutReturn?.status !== 'complete') return;
    loadClubShop(true);
  }, [activeTab, checkoutReturn?.status, loadClubShop]);

  // ═══ Club Shop: Admin: load all items (active + hidden) ═══
  const loadClubShopAdmin = useCallback(async () => {
    if (!clubShopClubId || clubShopAdminLoadingRef.current) return false;
    const requestClubId = clubShopClubId;
    const controller = new AbortController();
    let timedOut = false;
    clubShopAdminAbortRef.current?.abort();
    clubShopAdminAbortRef.current = controller;
    clubShopAdminLoadingRef.current = true;
    setClubShopAdminLoading(true);
    setClubShopAdminError(null);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 12000);
    try {
      const token = await getFreshAccessToken();
      if (!token) throw new Error('Please sign in again to manage the Club Shop.');
      if (controller.signal.aborted) return false;
      const response = await fetch(
        `/api/club-arena/manage-shop?clubId=${encodeURIComponent(requestClubId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `The operator report failed (${response.status}).`);
      }
      if (
        !Array.isArray(data.items) ||
        !data.report ||
        typeof data.report.complete !== 'boolean' ||
        !data.report.diamondTotals ||
        !data.report.legacyChipTotals
      ) {
        throw new Error('The operator report returned an invalid response. Please retry.');
      }
      const itemsWithCounts = data.items.map((i) => ({
        ...i,
        price: Number(i.price) || 0,
        purchase_count: Number(i.purchase_count) || 0,
        refunded_purchase_count: Number(i.refunded_purchase_count) || 0,
        net_purchase_count: Number(i.net_purchase_count) || 0,
        revenue: Number(i.revenue) || 0,
      }));
      setClubShopAdminItems(itemsWithCounts);
      setClubShopAdminReport(data.report || null);
      setClubShopAdminLoaded(true);
      return true;
    } catch (err) {
      if (controller.signal.aborted && !timedOut) return false;
      console.warn('[Club Shop Admin]', err);
      setClubShopAdminItems([]);
      setClubShopAdminReport(null);
      setClubShopAdminError(
        timedOut
          ? 'The verified sales ledger timed out. Check your connection and retry.'
          : err.message || 'The verified Club Shop sales report could not be loaded.'
      );
      setClubShopAdminLoaded(true);
      return false;
    } finally {
      clearTimeout(timeout);
      if (clubShopAdminAbortRef.current === controller) {
        clubShopAdminAbortRef.current = null;
        clubShopAdminLoadingRef.current = false;
        setClubShopAdminLoading(false);
      }
    }
  }, [clubShopClubId]);

  useEffect(() => {
    clubShopAdminAbortRef.current?.abort();
    clubShopAdminAbortRef.current = null;
    clubShopAdminLoadingRef.current = false;
    setClubShopAdminLoading(false);
    setClubShopAdminLoaded(false);
    setClubShopAdminItems([]);
    setClubShopAdminReport(null);
    setClubShopAdminError(null);
  }, [clubShopClubId]);

  useEffect(
    () => () => {
      clubShopAdminAbortRef.current?.abort();
    },
    []
  );

  const handleClubShopAdminAction = useCallback(
    async (action, item) => {
      if (!item?.id || !item?.club_id || clubShopAdminActionRef.current) return;
      setClubShopAdminAction(item.id);
      try {
        const token = getAccessToken();
        if (!token) throw new Error('Not authenticated');
        const response = await fetch('/api/club-arena/shop-items', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, clubId: item.club_id, itemId: item.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          const message = data.hasSales
            ? 'Items With Purchase History Cannot Be Deleted. Hide This Item Instead.'
            : data.error || `HTTP ${response.status}`;
          throw new Error(message);
        }
        if (action === 'delete') {
          setClubShopDeleteTarget(null);
          showStoreToast('success', `${item.name} Was Removed From The Club Shop.`);
        }
        await Promise.all([loadClubShopAdmin(), loadClubShop(true)]);
      } catch (error) {
        showStoreToast('error', error.message || 'The Club Shop Item Could Not Be Updated.');
      } finally {
        setClubShopAdminAction(null);
      }
    },
    [loadClubShop, loadClubShopAdmin, setClubShopAdminAction]
  );

  const clubShopIsAdmin = ['owner', 'admin'].includes(clubShopRole);

  // ═══ Club Shop: Auto-load when tab is restored/deep-linked ═══
  // activeTab is persisted, so a user can land directly on 'club-shop'
  // without ever clicking the tab button (which is the only other trigger).
  useEffect(() => {
    if (activeTab === 'club-shop' && user?.id && !clubShopLoaded && !clubShopLoadingRef.current) {
      loadClubShop();
    }
  }, [activeTab, clubShopLoaded, loadClubShop, user?.id]);

  // ═══ Club Shop: Real-time Supabase subscriptions ═══
  useEffect(() => {
    if (!clubShopClubId) return;
    const channelKey = `dstore-club-shop-${clubShopClubId}`;
    const channel = supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'club_shop_items',
          filter: `club_id=eq.${clubShopClubId}`,
        },
        () => {
          clubShopLoadingRef.current = false;
          loadClubShop(true);
          if (clubShopAdminLoaded) loadClubShopAdmin();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'club_shop_purchases',
          filter: `club_id=eq.${clubShopClubId}`,
        },
        () => {
          clubShopLoadingRef.current = false;
          loadClubShop(true);
          if (clubShopAdminLoaded) loadClubShopAdmin();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') console.warn('[Club Shop] Realtime channel error');
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clubShopClubId, loadClubShop, clubShopAdminLoaded, loadClubShopAdmin]);

  // ═══ Club Shop: Bus listeners for cross-component diamond sync ═══
  useEffect(() => {
    if (!clubShopClubId) return;
    const refresh = () => {
      clubShopLoadingRef.current = false;
      loadClubShop(true);
    };
    const unsubs = [
      listenBroadcast('BALANCE_UPDATED', refresh),
      listenBroadcast('smarter_poker_diamond_sync', refresh),
    ];
    return () => unsubs.forEach((u) => u());
  }, [clubShopClubId, loadClubShop]);

  // ═══ Club Shop: Visibility refresh (tab re-focus) ═══
  useEffect(() => {
    if (!clubShopClubId) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && activeTab === 'club-shop') {
        clubShopLoadingRef.current = false;
        loadClubShop(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [clubShopClubId, loadClubShop, activeTab]);

  const selectedVIPPlan =
    selectedVIP === 'vip-lifetime'
      ? VIP_MEMBERSHIP.lifetime
      : selectedVIP === 'vip-yearly'
        ? VIP_MEMBERSHIP.yearly
        : VIP_MEMBERSHIP.monthly;
  /* Lifetime is one payment, and its card checkout is not built yet - the
     session builder has no one-time VIP branch and the webhook has no
     one-time VIP grant. So the card button is not offered for it, and the
     label says what is actually available rather than a price that would 400.
     See VIP_SUBSCRIPTION_PLANS in create-checkout-session.js. */
  const lifetimeSelected = selectedVIPPlan?.interval === 'lifetime';
  const vipCardReady = selectedVIPPlan?.cardCheckoutReady !== false;
  const vipSubscribeLabel = vipCardReady
    ? `Subscribe: $${selectedVIPPlan?.price ?? '19.99'}/${selectedVIPPlan?.interval || 'month'}`
    : `Lifetime VIP Is Bought With Diamonds: ${Math.round(Number(selectedVIPPlan?.price || 0) * 100).toLocaleString()}`;

  return (
    <>
      <Head>
        <title>{TAB_META[activeTab]?.title || TAB_META.diamonds.title}</title>
        <meta
          name="description"
          content={TAB_META[activeTab]?.description || TAB_META.diamonds.description}
        />
        <link rel="canonical" href={`https://smarter.poker${TAB_ROUTES[activeTab]}`} />
        <meta
          key="store-og-title"
          property="og:title"
          content={TAB_META[activeTab]?.title || TAB_META.diamonds.title}
        />
        <meta
          key="store-og-description"
          property="og:description"
          content={TAB_META[activeTab]?.description || TAB_META.diamonds.description}
        />
        <meta key="store-og-type" property="og:type" content="website" />
        <meta
          key="store-og-url"
          property="og:url"
          content={`https://smarter.poker${TAB_ROUTES[activeTab]}`}
        />
        <meta
          key="store-og-image"
          property="og:image"
          content={`https://smarter.poker${TAB_SOCIAL_IMAGE[activeTab]}`}
        />
        <meta key="store-twitter-card" name="twitter:card" content="summary_large_image" />
        <meta
          key="store-twitter-title"
          name="twitter:title"
          content={TAB_META[activeTab]?.title || TAB_META.diamonds.title}
        />
        <meta
          key="store-twitter-description"
          name="twitter:description"
          content={TAB_META[activeTab]?.description || TAB_META.diamonds.description}
        />
        <meta
          key="store-twitter-image"
          name="twitter:image"
          content={`https://smarter.poker${TAB_SOCIAL_IMAGE[activeTab]}`}
        />
        <script
          key="store-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeStructuredData(activeTab)) }}
        />
        <link
          rel="preload"
          as="image"
          href={
            activeTab === 'diamonds'
              ? '/images/store-v3/diamond-vault-hero.webp'
              : TAB_SOCIAL_IMAGE[activeTab]
          }
          type="image/webp"
          fetchPriority="high"
        />

        <style>{`
                    /* <details> in the VIP FAQ: Safari/WebKit paints its OWN
                       disclosure triangle in addition to our chevron unless the
                       marker is removed, so the question rendered with two
                       arrows. list-style:none alone does not do it. */
                    .diamond-store-page summary::-webkit-details-marker { display: none; }
                    .diamond-store-page summary::marker { content: ''; }
                    .diamond-store-page details > summary .faq-chevron { transition: transform 0.2s ease; }
                    .diamond-store-page details[open] > summary .faq-chevron { transform: rotate(180deg); }
                    /* 800px Design Canvas - CSS Zoom Scaling (Training Page Template) */
                    .diamond-store-page { width: 100%; max-width: 100%; margin: 0 auto; overflow-x: hidden; }
                    .store-redesign-content, .store-redesign-content button, .store-redesign-content a,
                    .store-redesign-content h1, .store-redesign-content h2, .store-redesign-content h3,
                    .store-redesign-content h4, .store-redesign-content p, .store-redesign-content span,
                    .store-redesign-content strong, .store-redesign-content summary {
                        text-transform: capitalize;
                    }
                    .store-redesign-content button, .store-redesign-content a,
                    .store-redesign-content details, .store-redesign-content section,
                    .store-redesign-content article,
                    .store-redesign-content [style*="border-radius"] { border-radius: 0 !important; }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translate(-50%, -6px); }
                        to { opacity: 1; transform: translate(-50%, 0); }
                    }
                `}</style>
      </Head>

      <StoreToast />
      <PageTransition disableInitialAnimation>
        <div className="diamond-store-page" style={styles.container}>
          {/* Background */}
          <div style={styles.bgGrid} />
          <div style={styles.bgGlow} />

          {/* Header */}
          <UniversalHeader pageDepth={1} />

          <main className={`store-redesign-content ${shellStyles.root}`}>
            <CheckoutStatusPanel
              state={checkoutReturn}
              onDismiss={() => setCheckoutReturn(null)}
              onRetry={() => setCheckoutVerificationAttempt((attempt) => attempt + 1)}
            />
            <SmarterStoreShowcase
              activeTab={activeTab}
              packages={DIAMOND_PACKAGES}
              isProcessing={isProcessing}
              busyPackageId={busyPackageId}
              onBuy={handleDirectCheckout}
            />

            <MarketplaceCommerceNav active="store" />

            {/* Main Content (non-diamonds tabs) */}
            <div
              className={shellStyles.contentShell}
              data-store-section={activeTab}
              style={{
                ...styles.content,
                ...(activeTab === 'vip' ? { paddingTop: 8 } : {}),
              }}
            >
              {LOWER_SECTION_META[activeTab] && (
                <section
                  className={shellStyles.sectionThreshold}
                  data-section={activeTab}
                  aria-labelledby={`${activeTab}-commerce-heading`}
                >
                  <div className={shellStyles.thresholdImage} aria-hidden="true" />
                  <div className={shellStyles.thresholdCopy}>
                    <span>{LOWER_SECTION_META[activeTab].code}</span>
                    <h2 id={`${activeTab}-commerce-heading`}>
                      {LOWER_SECTION_META[activeTab].title}
                    </h2>
                    <p>{LOWER_SECTION_META[activeTab].description}</p>
                  </div>
                  <div className={shellStyles.thresholdReadout} aria-hidden="true">
                    <span>SECURE COMMERCE</span>
                    <strong>LIVE</strong>
                  </div>
                </section>
              )}

              {/* ═══════════════════════════════════════════════════════════════════ */}
              {/* VIP MEMBERSHIP TAB */}
              {/* ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'vip' && (
                <>
                  {/* ═══════════════════════════════════════════════════════════
                    VIP PURCHASE BLOCK

                    Restored 2026-08-26. `VIPCard` was imported and never
                    rendered, `handleVIPSubscribe` was defined and never called,
                    and `vipSubscribeLabel` was computed and never read : so the
                    VIP page listed 23 benefits and 11 FAQs and then offered no
                    way whatsoever to become a member. Verified against the
                    deployed bundle before touching anything: "subscribe-button
                    .png" and "Subscribe :" both returned 0 occurrences in
                    production.
                   ═══════════════════════════════════════════════════════════ */}

                  {/* Current membership, when there is one. Without this the page
                    invites an existing member to "Subscribe" as though they had
                    nothing : the single most likely way to take a second
                    payment from someone who already paid. */}
                  {isVip && (
                    <div
                      className={shellStyles.rewardsBoostLayout}
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(255,215,0,0.04))',
                        border: '1px solid rgba(255,215,0,0.35)',
                        borderRadius: 14,
                        padding: '14px 18px',
                        marginBottom: 18,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Crown size={22} color="#FFD700" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 15 }}>
                          You Are Already A VIP Member
                          {vipTier
                            ? `: ${String(vipTier).replace(/^./, (c) => c.toUpperCase())}`
                            : ''}
                        </div>
                        <div style={{ color: '#B0B3B8', fontSize: 13, marginTop: 2 }}>
                          {vipExpiresAt
                            ? `Your Access Runs Until ${new Date(vipExpiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}. Anything You Buy Below Is Added To The End Of That, Never Instead Of It.`
                            : 'Anything You Buy Below Extends Your Membership Rather Than Replacing It.'}
                        </div>
                      </div>
                      <a
                        href="/hub/settings?section=billing"
                        style={{
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '10px 16px',
                          border: '1px solid rgba(255,215,0,0.55)',
                          background: 'linear-gradient(180deg, #3A3214, #0D0B04)',
                          color: '#FFF1A6',
                          fontSize: 13,
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        Manage VIP In Account Settings
                      </a>
                    </div>
                  )}

                  {/* Plan selection */}
                  <div
                    className={shellStyles.planRail}
                    style={styles.vipPlansRow}
                    role="region"
                    aria-label="VIP Membership Plans"
                    tabIndex={0}
                  >
                    <VIPCard
                      plan={VIP_MEMBERSHIP.monthly}
                      isSelected={selectedVIP === 'vip-monthly'}
                      onSelect={setSelectedVIP}
                    />
                    <VIPCard
                      plan={VIP_MEMBERSHIP.yearly}
                      isSelected={selectedVIP === 'vip-yearly'}
                      onSelect={setSelectedVIP}
                    />
                    <VIPCard
                      plan={VIP_MEMBERSHIP.lifetime}
                      isSelected={selectedVIP === 'vip-lifetime'}
                      onSelect={setSelectedVIP}
                    />
                  </div>

                  <nav
                    aria-label="VIP Membership Tools"
                    style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14 }}
                  >
                    <Link
                      href="/hub/vip-membership/compare"
                      style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '9px 15px', border: '1px solid #385D70', color: '#8FE8FF', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}
                    >
                      Compare Every VIP Plan
                    </Link>
                    <Link
                      href="/hub/vip-membership/manage"
                      style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center', padding: '9px 15px', border: '1px solid #385D70', color: '#8FE8FF', textDecoration: 'none', fontSize: 12, fontWeight: 700 }}
                    >
                      Open VIP Command Center
                    </Link>
                  </nav>

                  {/* Yearly saving, stated in money rather than implied by a badge */}
                  {selectedVIP === 'vip-yearly' && VIP_MEMBERSHIP.yearly.savings > 0 && (
                    <div
                      style={{
                        textAlign: 'center',
                        marginTop: 10,
                        fontSize: 13,
                        color: '#58d9ff',
                        fontWeight: 600,
                      }}
                    >
                      Saves ${Number(VIP_MEMBERSHIP.yearly.savings).toFixed(2)} A Year Against
                      Paying Monthly: About Two Months Free
                    </div>
                  )}

                  {/* Primary call to action */}
                  <div style={styles.vipSubscribeSection}>
                    <button
                      type="button"
                      disabled={isProcessing || vipTier === 'lifetime'}
                      aria-busy={isProcessing}
                      aria-label={isProcessing ? 'Processing' : vipSubscribeLabel}
                      onClick={handleVIPSubscribe}
                      style={{
                        cursor: isProcessing ? 'wait' : vipTier === 'lifetime' ? 'not-allowed' : 'pointer',
                        opacity: isProcessing || vipTier === 'lifetime' ? 0.6 : 1,
                        transition: 'transform 0.15s ease, filter 0.15s ease',
                        display: 'inline-block',
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        color: 'inherit',
                      }}
                    >
                      <img
                        src="/images/subscribe-button.webp"
                        width={1249}
                        height={258}
                        alt=""
                        style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
                        draggable={false}
                        loading="lazy"
                      />
                      {/* The button artwork is a static $19.99/month image, so the
                        live plan is stated in text beneath it. Without this the
                        picture contradicts the selected plan. */}
                      <div
                        style={{
                          textAlign: 'center',
                          marginTop: 8,
                          fontSize: 14,
                          fontWeight: 700,
                          color: '#FFD700',
                        }}
                      >
                        {isProcessing ? 'Processing...' : vipSubscribeLabel}
                      </div>
                    </button>
                  </div>

                  {/* Pay in diamonds. Every term settles this way at 100
                    diamonds per dollar, lifetime included - it is the ONLY way
                    to buy lifetime until its card path is built. */}
                  {selectedVIPPlan && (
                    <div style={{ textAlign: 'center', marginTop: 14, marginBottom: 8 }}>
                      {(() => {
                        const planKey =
                          selectedVIP === 'vip-lifetime'
                            ? 'lifetime'
                            : selectedVIP === 'vip-yearly'
                              ? 'yearly'
                              : 'monthly';
                        // Mirrors the server: 100 diamonds per dollar, derived
                        // from the same catalog price rather than a second copy.
                        const cost = Math.round(Number(selectedVIPPlan.price) * 100);
                        const known = diamondBalance != null;
                        const short = known ? cost - diamondBalance : 0;
                        const canAfford = vipTier !== 'lifetime' && (!known || short <= 0);
                        return (
                          <>
                            <button
                              type="button"
                              disabled={isProcessing || !canAfford}
                              onClick={() => {
                                if (!user?.id) {
                                  showStoreToast('error', 'Please Sign In To Purchase VIP.');
                                  return;
                                }
                                const commerceIntent = {
                                  scope: `vip-${planKey}`,
                                  userId: user.id,
                                  paymentMethod: 'diamonds',
                                  intent: { plan: planKey },
                                };
                                setPendingSpend({
                                  kind: 'plan',
                                  planKey,
                                  title: `Pay For ${selectedVIPPlan.name} With Diamonds`,
                                  cost,
                                  detail:
                                    planKey === 'lifetime'
                                      ? `${Number(cost).toLocaleString()} Diamonds, Once. Your Membership Stops Having An Expiry Date Rather Than Getting A Longer One, And It Never Renews.`
                                      : `${Number(cost).toLocaleString()} Diamonds For ${planKey === 'yearly' ? '365' : '30'} Days Of VIP. This Extends Any Membership You Already Have Rather Than Replacing It.`,
                                  commerceIntent,
                                  idempotencyKey: getOrCreateCommerceRequestId(commerceIntent),
                                });
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '11px 22px',
                                borderRadius: 12,
                                background: canAfford
                                  ? 'rgba(0,180,255,0.12)'
                                  : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${canAfford ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
                                color: canAfford ? '#00D4FF' : 'rgba(255,255,255,0.4)',
                                fontSize: 15,
                                fontWeight: 600,
                                cursor: isProcessing || !canAfford ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <Gem size={16} />
                              Pay With Diamonds Instead: {Number(cost).toLocaleString()}
                            </button>
                            <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 8 }}>
                              {!known
                                ? 'Sign In To Pay With Diamonds.'
                                : vipTier === 'lifetime'
                                  ? 'Lifetime VIP Already Includes This Membership.'
                                : canAfford
                                  ? `You Have ${Number(diamondBalance).toLocaleString()} Diamonds.`
                                  : `You Have ${Number(diamondBalance).toLocaleString()} And Need ${Number(short).toLocaleString()} More.`}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* Diamond-spend confirmation. Replaces the native browser prompt, which
                    blocks the tab, cannot be styled, and is easy to miss inside
                    an installed PWA. Nothing is spent until Confirm is pressed,
                    and the idempotency key is minted when the modal OPENS so a
                    double-tap cannot mint a second purchase. */}
                  {pendingSpend && (
                    <div
                      onClick={() => !isProcessing && setPendingSpend(null)}
                      className={shellStyles.dialogBackdrop}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.72)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 20,
                        zIndex: 9999,
                      }}
                    >
                      <div
                        ref={pendingSpendDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="vip-spend-dialog-title"
                        aria-describedby="vip-spend-dialog-description"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        className={shellStyles.dialogPanel}
                        style={{
                          background: '#16181C',
                          border: '1px solid rgba(255,215,0,0.3)',
                          borderRadius: 16,
                          padding: '22px 20px',
                          maxWidth: 420,
                          width: '100%',
                        }}
                      >
                        <h4
                          id="vip-spend-dialog-title"
                          style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FFD700' }}
                        >
                          {pendingSpend.title}
                        </h4>
                        <p
                          id="vip-spend-dialog-description"
                          style={{
                            margin: '10px 0 0',
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#B0B3B8',
                          }}
                        >
                          {pendingSpend.detail}
                        </p>
                        <div
                          style={{
                            margin: '14px 0 18px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 20,
                            fontWeight: 700,
                            color: '#00D4FF',
                          }}
                        >
                          <Gem size={20} />
                          {Number(pendingSpend.cost).toLocaleString()} Diamonds
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => setPendingSpend(null)}
                            style={{
                              flex: 1,
                              padding: '11px 0',
                              borderRadius: 10,
                              background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.18)',
                              color: '#E4E6EB',
                              fontSize: 15,
                              fontWeight: 600,
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={async () => {
                              // One kind of spend since the Daily Pass was
                              // retired: a plan bought with diamonds.
                              const spend = pendingSpend;
                              const applied = await runDiamondPlanPurchase(
                                spend.planKey,
                                spend.idempotencyKey,
                                spend.commerceIntent
                              );
                              // Keep the same operation identity through an
                              // ambiguous response or retryable failure.
                              if (applied) setPendingSpend(null);
                            }}
                            style={{
                              flex: 1,
                              padding: '11px 0',
                              borderRadius: 10,
                              background: 'rgba(255,215,0,0.15)',
                              border: '1px solid rgba(255,215,0,0.45)',
                              color: '#FFD700',
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: isProcessing ? 'wait' : 'pointer',
                            }}
                          >
                            {isProcessing ? 'Processing...' : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VIP Benefits Table */}
                  <div className={shellStyles.vipBenefits} style={styles.benefitsSection}>
                    <h2 style={styles.benefitsTitle}>Everything Included With VIP</h2>

                    {/* Smarter.Poker Platform */}
                    <div style={styles.benefitsCategoryHeader}>
                      <span style={styles.benefitsCategoryLabel}>Smarter.Poker Platform</span>
                    </div>
                    <div className={shellStyles.responsiveGrid} style={styles.benefitsGrid}>
                      {VIP_BENEFITS.filter((b) => b.category === 'Smarter.Poker').map(
                        (benefit, idx) => (
                          <div
                            key={idx}
                            className={shellStyles.premiumDataCard}
                            style={styles.benefitCard}
                          >
                            <div style={styles.benefitInfo}>
                              <div style={styles.benefitTitle}>{benefit.title}</div>
                              <div style={styles.benefitDesc}>{benefit.description}</div>
                            </div>
                            <div style={styles.benefitValue}>{benefit.value}</div>
                          </div>
                        )
                      )}
                    </div>
                    {/* Club & Diamond Arena Features */}
                    <div style={styles.benefitsCategoryHeader}>
                      <span style={styles.benefitsCategoryLabel}>
                        Club & Diamond Arena Features
                      </span>
                    </div>
                    <div className={shellStyles.responsiveGrid} style={styles.benefitsGrid}>
                      {VIP_BENEFITS.filter((b) => b.category === 'Club & Diamond Arena').map(
                        (benefit, idx) => (
                          <div
                            key={idx}
                            className={shellStyles.premiumDataCard}
                            style={styles.benefitCard}
                          >
                            <div style={styles.benefitInfo}>
                              <div style={styles.benefitTitle}>{benefit.title}</div>
                              <div style={styles.benefitDesc}>{benefit.description}</div>
                            </div>
                            <div style={styles.benefitValue}>{benefit.value}</div>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* View in Marketplace Link */}
                  <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a
                      href={TAB_ROUTES.merch}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        color: '#FFD700',
                        fontSize: 16,
                        fontWeight: 600,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        padding: '12px 24px',
                        borderRadius: 12,
                        background: 'rgba(255, 215, 0, 0.08)',
                        border: '1px solid rgba(255, 215, 0, 0.2)',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 215, 0, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)';
                        e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.2)';
                      }}
                    >
                      View In Marketplace <span style={{ fontSize: 18 }}>→</span>
                    </a>
                  </div>

                  {/* ─── Frequently Asked Questions ─── */}
                  <div
                    className={shellStyles.vipFaq}
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      borderRadius: 16,
                      padding: '28px 24px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <h2
                      style={{
                        fontSize: 20,
                        fontWeight: 700,
                        color: '#FFFFFF',
                        marginBottom: 20,
                        textAlign: 'center',
                      }}
                    >
                      Frequently Asked Questions
                    </h2>

                    {VIP_FAQ.map((faq, idx) => (
                      <details
                        key={idx}
                        style={{
                          borderBottom:
                            idx < VIP_FAQ.length - 1
                              ? '1px solid rgba(255, 255, 255, 0.06)'
                              : 'none',
                          paddingBottom: 0,
                        }}
                      >
                        <summary
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 0',
                            cursor: 'pointer',
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#E4E6EB',
                            listStyle: 'none',
                          }}
                        >
                          {faq.q}
                          <span
                            className="faq-chevron"
                            style={{
                              color: '#B0B3B8',
                              fontSize: 18,
                              marginLeft: 12,
                              flexShrink: 0,
                            }}
                          >
                            ▾
                          </span>
                        </summary>
                        <p
                          style={{
                            padding: '0 0 16px 0',
                            margin: 0,
                            fontSize: 14,
                            lineHeight: 1.6,
                            color: '#B0B3B8',
                          }}
                        >
                          {faq.a}
                        </p>
                      </details>
                    ))}
                  </div>
                </>
              )}

              {/* ═══════════════════════════════════════════════════════════════════ */}
              {/* MERCHANDISE TAB */}
              {/* ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'merch' && (
                <section className={shellStyles.merchSurface} aria-label="Official Merch Catalog">
                  <MerchStore user={user} authResolved={authResolved} />
                </section>
              )}

              {/* ═══════════════════════════════════════════════════════════════════ */}
              {/* SMARTER REWARDS TAB - Comprehensive Rewards Information Center */}
              {/* ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'rewards' && (
                <section className={shellStyles.rewardsSurface} aria-label="Smarter Rewards Center">
                  {/* Active Diamond Multiplier Banner */}
                  <div
                    style={{
                      margin: '12px 0 0',
                      padding: '14px 16px',
                      borderRadius: 12,
                      background:
                        diamondMultiplier > 1.0
                          ? 'linear-gradient(135deg, rgba(245,158,11,0.18), rgba(251,191,36,0.12))'
                          : 'linear-gradient(135deg, rgba(0,180,255,0.12), rgba(36,96,126,0.08))',
                      border: `1px solid ${diamondMultiplier > 1.0 ? 'rgba(245,158,11,0.45)' : 'rgba(0,180,255,0.3)'}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        className={shellStyles.rewardsBoostCopy}
                        style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                      >
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background:
                              diamondMultiplier > 1.0
                                ? 'rgba(245,158,11,0.2)'
                                : 'rgba(0,180,255,0.2)',
                            fontSize: 20,
                          }}
                        >
                          {diamondMultiplier > 1.0 ? (
                            <Zap size={20} color="#f59e0b" />
                          ) : (
                            <Gem size={20} color="#83c9e2" />
                          )}
                        </div>
                        <div>
                          <div
                            style={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: diamondMultiplier > 1.0 ? '#f59e0b' : '#83c9e2',
                            }}
                          >
                            {diamondMultiplier > 1.0
                              ? `${diamondMultiplier.toFixed(2)}× Diamond Boost Active`
                              : 'Activate Your Diamond Boost'}
                          </div>
                          <div
                            style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}
                          >
                            {diamondMultiplier > 1.0
                              ? `Every diamond you earn is multiplied ${diamondMultiplier.toFixed(2)}× by your share streak`
                              : 'Share posts daily for 3+ days to boost ALL your diamond earnings'}
                          </div>
                        </div>
                      </div>
                      <div
                        className={shellStyles.rewardsBoostTiers}
                        style={{ textAlign: 'right', flexShrink: 0 }}
                      >
                        {[
                          { label: 'Streak 3d', mult: '1.2×', color: '#60a5fa' },
                          { label: 'Expert 7d', mult: '1.5×', color: '#00d4ff' },
                          { label: 'Master 14d', mult: '1.75×', color: '#83c9e2' },
                          { label: 'Legend 30d', mult: '2.0×', color: '#f59e0b' },
                        ].map((tier) => (
                          <span
                            key={tier.label}
                            style={{
                              display: 'inline-block',
                              margin: '2px 3px',
                              fontSize: 10,
                              fontWeight: 600,
                              color: tier.color,
                              background: `${tier.color}18`,
                              border: `1px solid ${tier.color}35`,
                              borderRadius: 6,
                              padding: '2px 6px',
                            }}
                          >
                            {tier.label} {tier.mult}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sub-Tab Navigation */}
                  <div
                    role="tablist"
                    aria-label="Smarter Rewards Sections"
                    style={styles.rewardsSubNav}
                  >
                    <button
                      type="button"
                      role="tab"
                      id="rewards-tab-overview"
                      aria-selected={rewardsSubTab === 'overview'}
                      aria-controls="rewards-panel-overview"
                      tabIndex={rewardsSubTab === 'overview' ? 0 : -1}
                      onClick={() => setRewardsSubTab('overview')}
                      onKeyDown={(event) => handleRewardsTabKeyDown(event, 'overview')}
                      style={{
                        ...styles.rewardsSubTab,
                        ...(rewardsSubTab === 'overview' ? styles.rewardsSubTabActive : {}),
                      }}
                    >
                      Overview
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="rewards-tab-diamonds"
                      aria-selected={rewardsSubTab === 'diamonds'}
                      aria-controls="rewards-panel-diamonds"
                      tabIndex={rewardsSubTab === 'diamonds' ? 0 : -1}
                      onClick={() => setRewardsSubTab('diamonds')}
                      onKeyDown={(event) => handleRewardsTabKeyDown(event, 'diamonds')}
                      style={{
                        ...styles.rewardsSubTab,
                        ...(rewardsSubTab === 'diamonds' ? styles.rewardsSubTabActive : {}),
                      }}
                    >
                      Diamond Rewards
                    </button>

                    <button
                      type="button"
                      role="tab"
                      id="rewards-tab-eggs"
                      aria-selected={rewardsSubTab === 'eggs'}
                      aria-controls="rewards-panel-eggs"
                      tabIndex={rewardsSubTab === 'eggs' ? 0 : -1}
                      onClick={() => setRewardsSubTab('eggs')}
                      onKeyDown={(event) => handleRewardsTabKeyDown(event, 'eggs')}
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
                    <div
                      id="rewards-panel-overview"
                      role="tabpanel"
                      aria-labelledby="rewards-tab-overview"
                      tabIndex={0}
                      className={shellStyles.subPanel}
                      style={styles.rewardsOverview}
                    >
                      <h2 style={styles.earnTitle}>Smarter Rewards</h2>
                      <p style={styles.introText}>
                        Welcome To The Smarter Rewards System! Earn Diamonds By Playing, Training,
                        And Engaging With The Community.
                      </p>

                      <div className={shellStyles.responsiveGrid} style={styles.overviewGrid}>
                        <div className={shellStyles.casinoDataCard} style={styles.overviewCard}>
                          <div style={styles.overviewIcon}>
                            <Gem size={40} color="#00D4FF" />
                          </div>
                          <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                          <p style={styles.overviewCardText}>
                            Earn Diamonds Through Daily Logins, Training, Social Engagement, And
                            Referrals.
                            <strong style={{ color: '#00d4ff' }}>
                              {' '}
                              Daily Cap: {DAILY_CAP.free} {GEM} ({DAILY_CAP.vip} VIP)
                            </strong>{' '}
                            With Up To {fmt(MONTHLY_CAP.free)} {GEM} A Month Free,{' '}
                            {fmt(MONTHLY_CAP.vip)} {GEM} VIP. Share Streak Multipliers Help You
                            Reach The Cap Faster: They Never Raise It.
                          </p>
                        </div>

                        <div className={shellStyles.casinoDataCard} style={styles.overviewCard}>
                          <div style={styles.overviewIcon}>
                            <Crown size={40} color="#FFD700" />
                          </div>
                          <h3 style={styles.overviewCardTitle}>VIP Membership</h3>
                          <div style={{ marginTop: 12, marginBottom: 12 }}>
                            <img
                              src="/images/vip-card.webp"
                              width={1024}
                              height={1024}
                              alt="VIP Membership Card"
                              style={{
                                width: '100%',
                                maxWidth: 320,
                                borderRadius: 12,
                                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                              }}
                              draggable={false}
                              loading="lazy"
                            />
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'center',
                              gap: 16,
                              marginTop: 8,
                            }}
                          >
                            <div
                              style={{
                                background:
                                  'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,215,0,0.05))',
                                border: '1px solid rgba(255,215,0,0.3)',
                                borderRadius: 10,
                                padding: '10px 18px',
                                textAlign: 'center',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 800,
                                  color: '#FFD700',
                                  fontFamily: 'Orbitron, sans-serif',
                                }}
                              >
                                $19.99
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'rgba(255,255,255,0.6)',
                                  marginTop: 2,
                                }}
                              >
                                Per Month
                              </div>
                            </div>
                            <div
                              style={{
                                background:
                                  'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.05))',
                                border: '1px solid rgba(0,212,255,0.3)',
                                borderRadius: 10,
                                padding: '10px 18px',
                                textAlign: 'center',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 800,
                                  color: '#00D4FF',
                                  fontFamily: 'Orbitron, sans-serif',
                                }}
                              >
                                $199.99
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  color: 'rgba(255,255,255,0.6)',
                                  marginTop: 2,
                                }}
                              >
                                Per Year (Save $40!)
                              </div>
                            </div>
                          </div>
                          <a
                            href={TAB_ROUTES.vip}
                            aria-label="View VIP Plans"
                            style={{
                              display: 'inline-block',
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
                              textDecoration: 'none',
                            }}
                          >
                            View VIP Plans →
                          </a>
                        </div>

                        <div className={shellStyles.casinoDataCard} style={styles.overviewCard}>
                          <div style={styles.overviewIcon}>
                            <Gift size={40} color="#00d4ff" />
                          </div>
                          <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                          <p style={styles.overviewCardText}>
                            Discover <strong>{TOTAL_EASTER_EGGS} Hidden Achievements</strong> Across{' '}
                            {EGG_CATEGORY_COUNT} Categories. From Performance To Legacy Milestones:
                            Eggs Pay Up To {EASTER_EGG_MONTHLY_CAP} {GEM} A Month On Top Of Your
                            Normal Cap. {EARNABLE_EGG_COUNT} Are Live Now.
                          </p>
                        </div>
                      </div>

                      <div style={styles.quickStats}>
                        <div style={styles.quickStat}>
                          <span style={styles.quickStatValue}>{DAILY_CAP.free}</span>
                          <span style={styles.quickStatLabel}>Daily Cap (Free)</span>
                        </div>
                        <div style={styles.quickStat}>
                          <span style={styles.quickStatValue}>
                            {Object.keys(VIP_MEMBERSHIP).length}
                          </span>
                          <span style={styles.quickStatLabel}>VIP Plans</span>
                        </div>
                        <div style={styles.quickStat}>
                          <span style={styles.quickStatValue}>{TOTAL_EASTER_EGGS}</span>
                          <span style={styles.quickStatLabel}>Easter Eggs</span>
                        </div>
                        <div style={styles.quickStat}>
                          <span style={styles.quickStatValue}>{STANDARD_REWARDS.length}</span>
                          <span style={styles.quickStatLabel}>Standard Rewards</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DIAMOND REWARDS SUB-TAB */}
                  {rewardsSubTab === 'diamonds' && (
                    <div
                      id="rewards-panel-diamonds"
                      role="tabpanel"
                      aria-labelledby="rewards-tab-diamonds"
                      tabIndex={0}
                      className={shellStyles.subPanel}
                      style={styles.diamondRewardsSection}
                    >
                      <h2 style={styles.earnTitle}>Diamond Rewards</h2>
                      <p style={styles.introText}>
                        All {TOTAL_WAYS_TO_EARN} Ways You Can Earn Diamonds On Smarter.Poker:{' '}
                        {STANDARD_REWARDS.length} Standard Rewards Plus {TOTAL_EASTER_EGGS} Hidden
                        Achievements
                      </p>

                      {/* Daily Cap Banner */}
                      <div className={shellStyles.rewardsCapBanner} style={styles.capBanner}>
                        <div style={styles.capInfo}>
                          <span style={styles.capNumber}>{DAILY_CAP.free}</span>
                          <span style={styles.capLabel}>
                            Daily Cap · {fmt(MONTHLY_CAP.free)} A Month
                          </span>
                        </div>
                        <div style={styles.capDivider} />
                        <div style={styles.capInfo}>
                          <span style={styles.capNumber}>{DAILY_CAP.vip}</span>
                          <span style={styles.capLabel}>
                            VIP Daily Cap · {fmt(MONTHLY_CAP.vip)} A Month
                          </span>
                        </div>
                        <div style={styles.capDivider} />
                        <div style={styles.streakMultipliers}>
                          <div style={styles.multiplierItem}>
                            <span style={styles.multiplierValue}>1.5x</span>
                            <span style={styles.multiplierLabel}>Share Streak 7d</span>
                          </div>
                          <div style={styles.multiplierItem}>
                            <span style={styles.multiplierValueGold}>2.0x</span>
                            <span style={styles.multiplierLabel}>Share Streak 30d</span>
                          </div>
                        </div>
                      </div>
                      <p style={styles.introText}>
                        The Cap Is Measured After Your Share Streak Multiplier: Multipliers Help
                        You Reach {DAILY_CAP.free} {GEM} A Day With Less Work, They Never Raise It.
                        Easter Eggs Draw On A Separate {EASTER_EGG_MONTHLY_CAP} {GEM} Per Month
                        Budget On Top. 1 {GEM} = $0.01, So {fmt(MONTHLY_CAP.free)} {GEM} A Month = $
                        {(MONTHLY_CAP.free / 100).toFixed(0)}.
                      </p>

                      {/* Standard Rewards List */}
                      <div style={styles.rewardCategory}>
                        <h3 style={styles.categoryTitle}>All Standard Rewards</h3>
                        <div style={styles.rewardList}>
                          {STANDARD_REWARDS.map((reward, idx) => (
                            <div
                              key={idx}
                              className={shellStyles.rewardRow}
                              style={styles.rewardItem}
                            >
                              <span style={styles.rewardIcon}>
                                {reward.icon && <reward.icon size={24} />}
                              </span>
                              <div style={styles.rewardDetails}>
                                <span style={styles.rewardName}>
                                  <RewardDetailLink reward={reward}>{reward.name}</RewardDetailLink>
                                </span>
                                <span style={styles.rewardNote}>{reward.note}</span>
                              </div>
                              <span style={styles.rewardAmount}>{reward.amount}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* EASTER EGGS SUB-TAB */}
                  {rewardsSubTab === 'eggs' && (
                    <div
                      id="rewards-panel-eggs"
                      role="tabpanel"
                      aria-labelledby="rewards-tab-eggs"
                      tabIndex={0}
                      className={shellStyles.subPanel}
                      style={styles.easterEggsSection}
                    >
                      <h2 style={styles.earnTitle}>
                        Easter Eggs - {TOTAL_EASTER_EGGS} Hidden Achievements
                      </h2>
                      <p style={styles.introText}>
                        {TOTAL_EASTER_EGGS} Hidden Achievements Across {EGG_CATEGORY_COUNT}{' '}
                        Categories: {EARNABLE_EGG_COUNT} Are Unlockable Today, The Rest Arrive As
                        Tracking Expands. Eggs Pay Up To {EASTER_EGG_MONTHLY_CAP} {GEM} A Month On
                        Top Of Your Normal Daily Cap, And The Biggest Single Egg Pays{' '}
                        {biggestEggValue()} {GEM}.
                      </p>

                      {/* Performance Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.performance} ({EASTER_EGG_COUNTS.performance}{' '}
                          Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.performance.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Timing & Loyalty Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.timing_loyalty} ({EASTER_EGG_COUNTS.timing_loyalty}{' '}
                          Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.timing_loyalty.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strategy & Mastery Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.strategy_mastery} (
                          {EASTER_EGG_COUNTS.strategy_mastery} Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.strategy_mastery.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Social & Viral Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.social_viral} ({EASTER_EGG_COUNTS.social_viral}{' '}
                          Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.social_viral.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Discovery Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.discovery} ({EASTER_EGG_COUNTS.discovery}{' '}
                          Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.discovery.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Legacy & Milestones Category */}
                      <div style={styles.eggCategory}>
                        <h3 style={styles.eggCategoryTitle}>
                          {EGG_CATEGORY_LABELS.legacy_milestones} (
                          {EASTER_EGG_COUNTS.legacy_milestones} Achievements)
                        </h3>
                        <div className={shellStyles.responsiveGrid} style={styles.eggGrid}>
                          {EASTER_EGGS.legacy_milestones.map((egg) => (
                            <div
                              key={egg.id}
                              className={shellStyles.casinoProductCard}
                              style={styles.eggCard}
                            >
                              <div style={styles.eggIcon}>{egg.icon && <egg.icon size={32} />}</div>
                              <h4 style={styles.eggName}><RewardDetailLink reward={egg}>{egg.name}</RewardDetailLink></h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {egg.rarity.toUpperCase()}
                              </div>
                              <div style={styles.eggReward}>{egg.reward}</div>
                              <p style={styles.eggTrigger}>{egg.trigger}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* ═══════════════════════════════════════════════════════════════════ */}
              {/* CLUB SHOP TAB: Diamond-funded marketplace items from user's club */}
              {/* ═══════════════════════════════════════════════════════════════════ */}
              {activeTab === 'club-shop' && (
                <>
                  {/* Success Flash */}
                  {clubShopSuccess && (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{
                        position: 'fixed',
                        top: 80,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'linear-gradient(135deg, #00d4ff, #007fbd)',
                        color: '#000',
                        padding: '12px 28px',
                        borderRadius: 12,
                        fontWeight: 700,
                        fontSize: 15,
                        zIndex: 9999,
                        boxShadow: '0 4px 20px rgba(0, 212, 255,0.4)',
                        animation: 'fadeIn 0.3s ease',
                      }}
                    >
                      <CheckCircle
                        size={16}
                        style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                      />{' '}
                      {clubShopSuccess}
                    </div>
                  )}

                  {/* Purchase Confirm Modal */}
                  {clubShopBuyTarget && (
                    <div
                      onClick={() => !clubShopProcessing && setClubShopBuyTarget(null)}
                      className={shellStyles.dialogBackdrop}
                      style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.7)',
                        backdropFilter: 'blur(6px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                      }}
                    >
                      <div
                        ref={clubShopDialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="club-shop-dialog-title"
                        aria-describedby="club-shop-dialog-description"
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                        className={shellStyles.dialogPanel}
                        style={{
                          background: '#1a1a2e',
                          border: '1px solid rgba(255,255,255,0.15)',
                          borderRadius: 16,
                          padding: 28,
                          maxWidth: 420,
                          width: '90%',
                          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
                        }}
                      >
                        <h3
                          id="club-shop-dialog-title"
                          style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 16 }}
                        >
                          Confirm Purchase
                        </h3>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 16,
                            marginBottom: 20,
                          }}
                        >
                          <div
                            style={{
                              width: 56,
                              height: 56,
                              borderRadius: 12,
                              background: 'rgba(255,255,255,0.05)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 28,
                            }}
                          >
                            {clubShopBuyTarget.image_url ? (
                              <img
                                src={clubShopBuyTarget.image_url}
                                alt=""
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 8,
                                  objectFit: 'cover',
                                }}
                              />
                            ) : (
                              <CartIcon size={28} color="#8b8d91" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#E4E6EB' }}>
                              {clubShopBuyTarget.name}
                            </div>
                            <div
                              id="club-shop-dialog-description"
                              style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}
                            >
                              {clubShopBuyTarget.description || ''}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                          <div
                            style={{
                              flex: 1,
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: 10,
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                              }}
                            >
                              Item Price
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#ff6b6b',
                                marginTop: 4,
                              }}
                            >
                              {clubShopBuyTarget.price.toLocaleString()}
                            </div>
                          </div>
                          <div
                            style={{
                              flex: 1,
                              background: 'rgba(255,255,255,0.05)',
                              borderRadius: 10,
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'uppercase',
                                letterSpacing: 1,
                              }}
                            >
                              Your Balance
                            </div>
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: 700,
                                color: '#00d4ff',
                                marginTop: 4,
                              }}
                            >
                              {clubDiamondBalance.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {clubDiamondBalance < clubShopBuyTarget.price && (
                          <div
                            style={{
                              color: '#ff6b6b',
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: 12,
                              textAlign: 'center',
                            }}
                          >
                            <AlertTriangle
                              size={14}
                              style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                            />{' '}
                            Insufficient Diamonds. You Need{' '}
                            {(clubShopBuyTarget.price - clubDiamondBalance).toLocaleString()} More.
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 12 }}>
                          <button
                            onClick={() => setClubShopBuyTarget(null)}
                            disabled={clubShopProcessing}
                            style={{
                              flex: 1,
                              padding: '12px',
                              background: 'rgba(255,255,255,0.08)',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: 10,
                              color: '#B0B3B8',
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleClubPurchase}
                            disabled={
                              clubShopProcessing || clubDiamondBalance < clubShopBuyTarget.price
                            }
                            style={{
                              flex: 1,
                              padding: '12px',
                              background:
                                clubShopProcessing || clubDiamondBalance < clubShopBuyTarget.price
                                  ? 'rgba(255,255,255,0.1)'
                                  : 'linear-gradient(135deg, #1877F2, #4285F4)',
                              border: 'none',
                              borderRadius: 10,
                              color: '#fff',
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: clubShopProcessing ? 'wait' : 'pointer',
                            }}
                          >
                            {clubShopProcessing ? 'Purchasing...' : 'Confirm Purchase'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={styles.intro}>
                    <h2
                      style={{
                        ...styles.merchTitle,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <Gamepad2
                        size={20}
                        style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }}
                      />{' '}
                      Club Shop
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          background: 'linear-gradient(135deg, #FFD700, #FFA500)',
                          color: '#000',
                          padding: '4px 14px',
                          borderRadius: 20,
                        }}
                      >
                        <Gem
                          size={14}
                          style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }}
                        />{' '}
                        {clubDiamondBalance.toLocaleString()} Diamonds
                      </span>
                    </h2>
                    <p style={styles.introText}>
                      Purchase In-Game Items For Your Club With Diamonds: Time Banks, Table Skins,
                      Throwables, Emotes & More.
                    </p>
                  </div>

                  {!user?.id ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
                      <Home size={48} color="rgba(255,255,255,0.3)" />
                      <div
                        style={{
                          marginTop: 12,
                          fontSize: 16,
                          color: 'rgba(255,255,255,0.7)',
                          fontWeight: 600,
                        }}
                      >
                        Sign In To Access Your Club Shop
                      </div>
                    </div>
                  ) : clubShopError ? (
                    <div
                      role="alert"
                      style={{
                        display: 'grid',
                        justifyItems: 'center',
                        gap: 14,
                        padding: 40,
                        color: '#FFD7D7',
                        textAlign: 'center',
                      }}
                    >
                      <AlertTriangle size={30} color="#FF6B6B" />
                      <div>{marketplaceCopy(clubShopError)}</div>
                      <button
                        type="button"
                        onClick={() => loadClubShop(false)}
                        disabled={clubShopLoading}
                        style={{
                          minHeight: 44,
                          padding: '10px 22px',
                          border: '1px solid #7BDCF2',
                          background: 'linear-gradient(180deg, #314A5A, #07121B)',
                          color: '#E9FBFF',
                          fontWeight: 700,
                          cursor: clubShopLoading ? 'wait' : 'pointer',
                        }}
                      >
                        {clubShopLoading ? 'Retrying...' : 'Retry Club Shop'}
                      </button>
                    </div>
                  ) : clubShopLoading && !clubShopLoaded ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}
                    >
                      Loading Club Shop...
                    </div>
                  ) : !clubShopClubId ? (
                    clubShopLoaded ? (
                      <div style={{ textAlign: 'center', padding: 40 }}>
                        <div style={{ marginBottom: 12 }}>
                          <Home size={48} color="rgba(255,255,255,0.3)" />
                        </div>
                        <div
                          style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}
                        >
                          No Club Found
                        </div>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>
                          Join A Club To Access The Club Shop.
                        </p>
                      </div>
                    ) : (
                      <div
                        role="status"
                        aria-live="polite"
                        style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}
                      >
                        Loading Club Shop...
                      </div>
                    )
                  ) : (
                    <div className={shellStyles.clubShopSurface}>
                      {/* Sub-tabs: Store / My Purchases / Manage (admin) */}
                      <div
                        role="group"
                        aria-label="Club Shop Views"
                        style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}
                      >
                        {[
                          {
                            key: 'store',
                            label: `Store (${clubShopItems.length})`,
                            LIcon: ShoppingBag,
                          },
                          {
                            key: 'my-purchases',
                            label: `My Purchases (${clubShopPurchases.length})`,
                            LIcon: Package,
                          },
                          ...(clubShopIsAdmin
                            ? [{ key: 'manage', label: 'Manage', LIcon: Wrench }]
                            : []),
                        ].map((st) => (
                          <button
                            type="button"
                            key={st.key}
                            aria-pressed={clubShopSubTab === st.key}
                            onClick={() => {
                              setClubShopSubTab(st.key);
                              if (st.key === 'manage' && !clubShopAdminLoaded) loadClubShopAdmin();
                            }}
                            style={{
                              padding: '8px 20px',
                              background:
                                clubShopSubTab === st.key
                                  ? 'rgba(0,180,255,0.15)'
                                  : 'rgba(255,255,255,0.05)',
                              border:
                                clubShopSubTab === st.key
                                  ? '1px solid rgba(0,180,255,0.4)'
                                  : '1px solid rgba(255,255,255,0.1)',
                              borderRadius: 10,
                              color:
                                clubShopSubTab === st.key ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                              fontSize: 13,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            {st.LIcon && (
                              <st.LIcon
                                size={13}
                                style={{
                                  display: 'inline',
                                  verticalAlign: 'middle',
                                  marginRight: 4,
                                }}
                              />
                            )}
                            {st.label}
                          </button>
                        ))}
                      </div>

                      {clubShopSubTab === 'store' && (
                        <>
                          {/* Category Filters */}
                          <div
                            role="group"
                            aria-label="Club Shop Categories"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
                          >
                            {[
                              'All',
                              'Time Banks',
                              'Table Skins',
                              'Throwables',
                              'Emotes',
                              'Avatars',
                              'Exclusive',
                            ].map((cat) => (
                              <button
                                type="button"
                                key={cat}
                                aria-pressed={clubShopCategory === cat}
                                onClick={() => setClubShopCategory(cat)}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: 20,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  background:
                                    clubShopCategory === cat
                                      ? 'rgba(0,180,255,0.2)'
                                      : 'rgba(255,255,255,0.05)',
                                  border:
                                    clubShopCategory === cat
                                      ? '1px solid #00B4FF'
                                      : '1px solid rgba(255,255,255,0.1)',
                                  color:
                                    clubShopCategory === cat ? '#00D4FF' : 'rgba(255,255,255,0.5)',
                                  transition: 'all 0.2s ease',
                                }}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          {/* Search + Sort */}
                          <div
                            className={shellStyles.controlRow}
                            style={{ display: 'flex', gap: 10, marginBottom: 20 }}
                          >
                            <input
                              type="text"
                              aria-label="Search Club Shop Items"
                              placeholder="Search items..."
                              value={clubShopSearch}
                              onChange={(e) => setClubShopSearch(e.target.value)}
                              style={{
                                flex: 1,
                                padding: '10px 16px',
                                borderRadius: 10,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#E4E6EB',
                                fontSize: 14,
                                outline: 'none',
                                boxSizing: 'border-box',
                              }}
                            />
                            <select
                              aria-label="Sort Club Shop Items"
                              value={clubShopSortMode}
                              onChange={(e) => setClubShopSortMode(e.target.value)}
                              style={{
                                padding: '10px 14px',
                                borderRadius: 10,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#E4E6EB',
                                fontSize: 13,
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              <option value="newest">Newest First</option>
                              <option value="price-low">Price: Low → High</option>
                              <option value="price-high">Price: High → Low</option>
                              <option value="popular">Most Popular</option>
                            </select>
                          </div>

                          {/* Item Grid */}
                          {(() => {
                            const activePurchasedIds = new Set(
                              clubShopPurchases
                                .filter((purchase) => !purchase.refunded_at)
                                .map((purchase) => purchase.item_id)
                            );
                            let filtered = [...clubShopItems];
                            if (clubShopCategory !== 'All') {
                              filtered = filtered.filter(
                                (i) =>
                                  (i.category || 'Time Banks').toLowerCase() ===
                                  clubShopCategory.toLowerCase()
                              );
                            }
                            if (clubShopSearch.trim()) {
                              const q = clubShopSearch.toLowerCase();
                              filtered = filtered.filter(
                                (i) =>
                                  i.name.toLowerCase().includes(q) ||
                                  (i.description || '').toLowerCase().includes(q)
                              );
                            }
                            // Sort
                            switch (clubShopSortMode) {
                              case 'price-low':
                                filtered.sort((a, b) => a.price - b.price);
                                break;
                              case 'price-high':
                                filtered.sort((a, b) => b.price - a.price);
                                break;
                              case 'popular':
                                filtered.sort(
                                  (a, b) => (b.purchase_count || 0) - (a.purchase_count || 0)
                                );
                                break;
                              default:
                                break; // newest = API order
                            }

                            if (filtered.length === 0) {
                              return (
                                <div style={{ textAlign: 'center', padding: 40 }}>
                                  <div style={{ marginBottom: 12 }}>
                                    <ShoppingBag size={48} color="rgba(255,255,255,0.3)" />
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 14,
                                      color: 'rgba(255,255,255,0.5)',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {clubShopItems.length === 0
                                      ? 'The shop is currently empty.'
                                      : 'No items match your filter.'}
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div
                                className={shellStyles.clubItemGrid}
                                style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                  gap: 16,
                                }}
                              >
                                {filtered.map((item) => {
                                  const purchaseLimit = Number(item.per_user_limit) || 0;
                                  const purchasedCount = Number(item.my_purchase_count) || 0;
                                  const blocked = item.stackable
                                    ? purchaseLimit > 0 && purchasedCount >= purchaseLimit
                                    : activePurchasedIds.has(item.id);
                                  const blockedLabel = item.stackable ? 'Limit Reached' : 'Owned';
                                  const cardTopUp = clubCardTopUpFor(item.price);
                                  const cardCharge = cardTopUp
                                    ? cardTopUp.price * cardTopUp.quantity
                                    : null;
                                  const cardDiamonds = cardTopUp
                                    ? cardTopUp.diamonds * cardTopUp.quantity
                                    : null;
                                  const cardRemainder = cardDiamonds == null
                                    ? null
                                    : Math.max(0, cardDiamonds - Number(item.price || 0));
                                  return (
                                    <article
                                      key={item.id}
                                      className={shellStyles.clubItemCard}
                                      style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 14,
                                        overflow: 'hidden',
                                        transition: 'border-color 0.2s, transform 0.2s',
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(0,180,255,0.3)';
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                        e.currentTarget.style.transform = 'translateY(0)';
                                      }}
                                    >
                                      <div
                                        className={shellStyles.clubProductMedia}
                                        style={{
                                          height: 120,
                                          background:
                                            'linear-gradient(135deg, rgba(0,180,255,0.08), rgba(36,96,126,0.08))',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          position: 'relative',
                                        }}
                                      >
                                        {CLUB_PRODUCT_ATLAS[item.name] ? (
                                          <div
                                            role="img"
                                            aria-label={item.name}
                                            className={shellStyles.clubProductAtlas}
                                            style={{
                                              backgroundPosition: CLUB_PRODUCT_ATLAS[item.name],
                                            }}
                                          />
                                        ) : item.image_url ? (
                                          <img
                                            src={item.image_url}
                                            alt={item.name}
                                            loading="lazy"
                                            decoding="async"
                                            style={{
                                              width: '100%',
                                              height: '100%',
                                              objectFit: 'cover',
                                            }}
                                          />
                                        ) : (
                                          <Gift size={40} color="#8b8d91" />
                                        )}
                                        <span
                                          style={{
                                            position: 'absolute',
                                            top: 8,
                                            right: 8,
                                            background: 'rgba(0,0,0,0.7)',
                                            color: '#E4E6EB',
                                            padding: '3px 8px',
                                            borderRadius: 6,
                                            fontSize: 10,
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                          }}
                                        >
                                          {item.category || 'Time Banks'}
                                        </span>
                                      </div>
                                      <div
                                        className={shellStyles.clubItemBody}
                                        style={{ padding: 14 }}
                                      >
                                        <div
                                          className={shellStyles.clubPriceActions}
                                          style={{
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: '#E4E6EB',
                                            marginBottom: 4,
                                          }}
                                        >
                                          {item.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: 11,
                                            color: '#AABAC2',
                                            marginBottom: 10,
                                            lineHeight: 1.4,
                                            minHeight: 30,
                                          }}
                                        >
                                          {item.description || 'No description.'}
                                        </div>
                                        <Link
                                          href={`/hub/club-shop/${item.id}?clubId=${clubShopClubId}`}
                                          style={{
                                            display: 'inline-flex',
                                            minHeight: 44,
                                            alignItems: 'center',
                                            color: '#70DFFF',
                                            fontSize: 12,
                                            fontWeight: 700,
                                            textDecoration: 'none',
                                          }}
                                        >
                                          View Item Details
                                        </Link>
                                        <div
                                          style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                          }}
                                        >
                                          <div>
                                            <span
                                              style={{
                                                fontSize: 16,
                                                fontWeight: 700,
                                                color: '#FFD700',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                              }}
                                            >
                                              <Gem size={14} /> {item.price.toLocaleString()}
                                            </span>
                                            <div className={shellStyles.cardEquivalent}>
                                              {cardCharge == null
                                                ? 'Card Limit Exceeded'
                                                : `$${cardCharge.toFixed(2)} Card · ${cardRemainder.toLocaleString()} Diamonds Remain`}
                                            </div>
                                            {(item.purchase_count || 0) > 0 && (
                                              <div
                                                style={{
                                                  fontSize: 10,
                                                  color: 'rgba(255,255,255,0.35)',
                                                  marginTop: 2,
                                                }}
                                              >
                                                {item.purchase_count} Sold
                                              </div>
                                            )}
                                          </div>
                                          <div className={shellStyles.clubItemActions}>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                if (blocked) return;
                                                if (!user?.id) {
                                                  showStoreToast('error', 'Please Sign In To Buy Club Shop Items.');
                                                  return;
                                                }
                                                const commerceIntent = {
                                                  scope: `club-${item.id}`,
                                                  userId: user.id,
                                                  paymentMethod: 'diamonds',
                                                  intent: {
                                                    clubId: clubShopClubId,
                                                    itemId: item.id,
                                                  },
                                                };
                                                setClubShopBuyTarget({
                                                  ...item,
                                                  commerceIntent,
                                                  purchaseRequestId:
                                                    getOrCreateCommerceRequestId(commerceIntent),
                                                });
                                              }}
                                              disabled={
                                                blocked || clubShopCardProcessingId === item.id
                                              }
                                            >
                                              {blocked ? (
                                                <>
                                                  <CheckCircle size={12} /> {blockedLabel}
                                                </>
                                              ) : (
                                                <>
                                                  <Gem size={12} /> Diamonds
                                                </>
                                              )}
                                            </button>
                                            {!blocked && (
                                              <button
                                                type="button"
                                                onClick={() => handleClubCardCheckout(item)}
                                                disabled={Boolean(clubShopCardProcessingId) || !cardTopUp}
                                              >
                                                <CreditCard size={12} />
                                                {clubShopCardProcessingId === item.id
                                                  ? 'Opening...'
                                                  : cardCharge == null
                                                    ? 'Card Unavailable'
                                                    : `Card $${cardCharge.toFixed(2)}`}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </>
                      )}

                      {/* My Purchases Sub-Tab */}
                      {clubShopSubTab === 'my-purchases' && (
                        <>
                          {clubShopPurchases.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                              <div style={{ marginBottom: 12 }}>
                                <Package size={48} color="rgba(255,255,255,0.3)" />
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  color: 'rgba(255,255,255,0.5)',
                                  fontWeight: 600,
                                }}
                              >
                                No Purchases Yet.
                              </div>
                              <button
                                onClick={() => setClubShopSubTab('store')}
                                style={{
                                  marginTop: 12,
                                  padding: '10px 24px',
                                  borderRadius: 10,
                                  background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                                  border: 'none',
                                  color: '#fff',
                                  fontSize: 14,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                Browse Store
                              </button>
                            </div>
                          ) : (
                            <div
                              role="region"
                              aria-label="Club Shop Purchase History"
                              tabIndex={0}
                              style={{ overflowX: 'auto' }}
                            >
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  background: 'rgba(255,255,255,0.03)',
                                  borderRadius: 12,
                                }}
                              >
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.65)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Item
                                    </th>
                                    <th
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.65)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Category
                                    </th>
                                    <th
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.65)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Price Paid
                                    </th>
                                    <th
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.65)',
                                        textTransform: 'uppercase',
                                      }}
                                    >
                                      Date
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {clubShopPurchases.map((p) => {
                                    const itemData = clubShopItems.find((i) => i.id === p.item_id);
                                    const name = p.item_name || itemData?.name || 'Unknown Item';
                                    const cat =
                                      p.item_category || itemData?.category || 'Time Banks';
                                    const dateStr = p.created_at
                                      ? new Date(p.created_at).toLocaleDateString()
                                      : '';
                                    return (
                                      <tr
                                        key={p.id}
                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                                      >
                                        <td
                                          style={{
                                            padding: '12px 16px',
                                            fontSize: 14,
                                            fontWeight: 700,
                                            color: '#E4E6EB',
                                          }}
                                        >
                                          {name}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                          <span
                                            style={{
                                              padding: '3px 8px',
                                              borderRadius: 6,
                                              fontSize: 10,
                                              fontWeight: 600,
                                              background: 'rgba(255,255,255,0.08)',
                                              color: 'rgba(255,255,255,0.5)',
                                            }}
                                          >
                                            {cat}
                                          </span>
                                        </td>
                                        <td
                                          style={{
                                            padding: '12px 16px',
                                            fontSize: 14,
                                            fontWeight: 800,
                                            color: '#FFD700',
                                          }}
                                        >
                                          {(p.price_paid || 0).toLocaleString()}{' '}
                                          {p.currency === 'chips' ? 'Chips' : 'Diamonds'}
                                          {p.refunded_at && (
                                            <span
                                              style={{
                                                display: 'block',
                                                marginTop: 2,
                                                color: '#FF9B9B',
                                                fontSize: 10,
                                                fontWeight: 700,
                                              }}
                                            >
                                              Refunded
                                            </span>
                                          )}
                                        </td>
                                        <td
                                          style={{
                                            padding: '12px 16px',
                                            fontSize: 12,
                                            color: 'rgba(255,255,255,0.35)',
                                          }}
                                        >
                                          {dateStr}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}

                      {/* Manage Sub-Tab (admin only) */}
                      {clubShopSubTab === 'manage' && clubShopIsAdmin && (
                        <>
                          {clubShopAdminLoading && !clubShopAdminLoaded && (
                            <div
                              role="status"
                              aria-live="polite"
                              style={{
                                minHeight: 44,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 16,
                                border: '1px solid rgba(0,212,255,0.22)',
                                background: 'rgba(0,118,168,0.12)',
                                color: '#9DE8FF',
                                fontSize: 13,
                                fontWeight: 700,
                              }}
                            >
                              Loading Verified Sales Ledger...
                            </div>
                          )}

                          {clubShopAdminError && (
                            <div
                              role="alert"
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 12,
                                marginBottom: 16,
                                padding: '12px 14px',
                                border: '1px solid rgba(255,86,112,0.45)',
                                background: 'rgba(91,16,34,0.38)',
                                color: '#FFD2DA',
                              }}
                            >
                              <span>
                                <AlertTriangle
                                  size={16}
                                  aria-hidden="true"
                                  style={{ verticalAlign: 'middle', marginRight: 8 }}
                                />
                                {marketplaceCopy(clubShopAdminError)}
                              </span>
                              <button
                                type="button"
                                onClick={loadClubShopAdmin}
                                disabled={clubShopAdminLoading}
                                style={{
                                  minHeight: 44,
                                  padding: '8px 16px',
                                  border: '1px solid rgba(255,255,255,0.28)',
                                  background: 'rgba(255,255,255,0.08)',
                                  color: '#FFFFFF',
                                  fontWeight: 800,
                                  cursor: clubShopAdminLoading ? 'wait' : 'pointer',
                                }}
                              >
                                {clubShopAdminLoading ? 'Retrying...' : 'Retry Report'}
                              </button>
                            </div>
                          )}

                          {clubShopAdminReport && !clubShopAdminReport.complete && (
                            <div
                              role="status"
                              style={{
                                marginBottom: 16,
                                padding: '12px 14px',
                                border: '1px solid rgba(255,196,64,0.42)',
                                background: 'rgba(83,56,0,0.34)',
                                color: '#FFE6A6',
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
                              Report Is Partial: {fmt(clubShopAdminReport.processedRows)} Of{' '}
                              {clubShopAdminReport.totalRowsExact
                                ? fmt(clubShopAdminReport.totalRows)
                                : `At Least ${fmt(clubShopAdminReport.totalRows)}`}{' '}
                              Ledger Rows Were Processed.
                            </div>
                          )}

                          {/* Admin Stats */}
                          {clubShopAdminReport && !clubShopAdminError && (() => {
                            const total = clubShopAdminItems.length;
                            const active = clubShopAdminItems.filter((i) => i.is_active).length;
                            const diamondTotals = clubShopAdminReport?.diamondTotals || {};
                            const legacyChipTotals = clubShopAdminReport?.legacyChipTotals || {};
                            return (
                              <>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                                    gap: 12,
                                    marginBottom: 12,
                                  }}
                                >
                                  {[
                                    { label: 'Total Items', val: total },
                                    { label: 'Active', val: active },
                                    { label: 'Net Diamond Sales', val: fmt(diamondTotals.netSales) },
                                    { label: 'Diamonds Burned', val: fmt(diamondTotals.net) },
                                    { label: 'Diamond Refunds', val: fmt(diamondTotals.refunded) },
                                  ].map((stat) => (
                                    <div
                                      key={stat.label}
                                      style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: 12,
                                        padding: '16px 14px',
                                        textAlign: 'center',
                                      }}
                                    >
                                      <div
                                        style={{ fontSize: 22, fontWeight: 800, color: '#00D4FF' }}
                                      >
                                        {stat.val}
                                      </div>
                                      <div
                                        style={{
                                          fontSize: 11,
                                          color: 'rgba(255,255,255,0.4)',
                                          fontWeight: 600,
                                          marginTop: 4,
                                        }}
                                      >
                                        {stat.label}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div
                                  style={{
                                    marginBottom: 24,
                                    padding: '10px 12px',
                                    borderLeft: '3px solid #00D4FF',
                                    background: 'rgba(0,118,168,0.09)',
                                    color: 'rgba(255,255,255,0.68)',
                                    fontSize: 11,
                                    lineHeight: 1.6,
                                  }}
                                >
                                  Club Shop Sales Are 100% Platform-Owned Diamond Burns. No Club,
                                  Owner, Agent, Affiliate, Or Commission Ledger Is Credited.
                                  {Number(legacyChipTotals.sales || 0) > 0 && (
                                    <span style={{ display: 'block', color: '#FFE6A6' }}>
                                      Legacy History: {fmt(legacyChipTotals.netSales)} Net Chip Sales /{' '}
                                      {fmt(legacyChipTotals.net)} Chips. These Are Kept Separate From
                                      Diamond Totals.
                                    </span>
                                  )}
                                </div>
                              </>
                            );
                          })()}

                          {/* Create Item Form */}
                          <div
                            style={{
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid rgba(255,255,255,0.08)',
                              borderRadius: 14,
                              padding: 20,
                              marginBottom: 24,
                            }}
                          >
                            <h3
                              style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: '#E4E6EB',
                                marginBottom: 14,
                              }}
                            >
                              <Wrench
                                size={14}
                                style={{
                                  display: 'inline',
                                  verticalAlign: 'middle',
                                  marginRight: 6,
                                }}
                              />{' '}
                              Create Shop Item
                            </h3>
                            <div
                              className={shellStyles.controlRow}
                              style={{ display: 'flex', gap: 10, marginBottom: 10 }}
                            >
                              <input
                                aria-label="Item Name"
                                value={clubShopNewName}
                                onChange={(e) => setClubShopNewName(e.target.value)}
                                placeholder="Item name"
                                maxLength={100}
                                style={{
                                  flex: 2,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#E4E6EB',
                                  fontSize: 14,
                                  outline: 'none',
                                }}
                              />
                              <input
                                type="number"
                                aria-label="Price In Diamonds"
                                value={clubShopNewPrice}
                                onChange={(e) => setClubShopNewPrice(e.target.value)}
                                placeholder="Price (Diamonds)"
                                min="1"
                                style={{
                                  flex: 1,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#E4E6EB',
                                  fontSize: 14,
                                  outline: 'none',
                                }}
                              />
                            </div>
                            <input
                              aria-label="Item Description"
                              value={clubShopNewDesc}
                              onChange={(e) => setClubShopNewDesc(e.target.value)}
                              placeholder="Description (optional)"
                              maxLength={500}
                              style={{
                                width: '100%',
                                padding: '10px 14px',
                                borderRadius: 10,
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: '#E4E6EB',
                                fontSize: 14,
                                outline: 'none',
                                marginBottom: 10,
                                boxSizing: 'border-box',
                              }}
                            />
                            <div
                              className={shellStyles.controlRow}
                              style={{ display: 'flex', gap: 10, marginBottom: 14 }}
                            >
                              <select
                                aria-label="Item Category"
                                value={clubShopNewCategory}
                                onChange={(e) => setClubShopNewCategory(e.target.value)}
                                style={{
                                  flex: 1,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#E4E6EB',
                                  fontSize: 13,
                                  outline: 'none',
                                  cursor: 'pointer',
                                }}
                              >
                                {[
                                  'Time Banks',
                                  'Table Skins',
                                  'Throwables',
                                  'Emotes',
                                  'Avatars',
                                  'Exclusive',
                                ].map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <input
                                aria-label="Item Image URL"
                                value={clubShopNewImage}
                                onChange={(e) => setClubShopNewImage(e.target.value)}
                                placeholder="Image URL (optional)"
                                style={{
                                  flex: 1,
                                  padding: '10px 14px',
                                  borderRadius: 10,
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: '#E4E6EB',
                                  fontSize: 14,
                                  outline: 'none',
                                }}
                              />
                            </div>
                            <button
                              type="button"
                              disabled={
                                clubShopProcessing || !clubShopNewName.trim() || !clubShopNewPrice
                              }
                              onClick={async () => {
                                if (clubShopProcessingRef.current) return;
                                const now = Date.now();
                                if (now - clubShopLastCreate < 3000) {
                                  showStoreToast(
                                    'warning',
                                    'Please wait before creating another item'
                                  );
                                  return;
                                }
                                const price = Math.floor(Number(clubShopNewPrice));
                                if (!price || price <= 0) {
                                  showStoreToast('error', 'Price must be a positive number');
                                  return;
                                }
                                if (price > 1000000000) {
                                  showStoreToast('error', 'Price exceeds maximum');
                                  return;
                                }
                                setClubProcessing(true);
                                try {
                                  // Server-side admin CRUD (post-Phase-37 RLS lockdown: anon
                                  // writes to club_shop_items now blocked by design).
                                  const token = getAccessToken();
                                  if (!token) throw new Error('Not authenticated');
                                  const resp = await fetch('/api/club-arena/shop-items', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      action: 'create',
                                      clubId: clubShopClubId,
                                      name: clubShopNewName.trim(),
                                      price,
                                      description: clubShopNewDesc.trim() || null,
                                      category: clubShopNewCategory,
                                      imageUrl: clubShopNewImage.trim() || null,
                                    }),
                                  });
                                  const json = await resp.json().catch(() => ({}));
                                  if (!resp.ok || !json.success)
                                    throw new Error(json.error || `HTTP ${resp.status}`);
                                  setClubShopLastCreate(Date.now());
                                  setClubShopNewName('');
                                  setClubShopNewPrice('');
                                  setClubShopNewDesc('');
                                  setClubShopNewImage('');
                                  setClubShopNewCategory('Time Banks');
                                  clubShopLoadingRef.current = false;
                                  await Promise.all([loadClubShopAdmin(), loadClubShop(true)]);
                                } catch (err) {
                                  showStoreToast('error', err.message);
                                } finally {
                                  setClubProcessing(false);
                                }
                              }}
                              style={{
                                padding: '10px 28px',
                                borderRadius: 10,
                                fontSize: 14,
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: 'linear-gradient(135deg, #1877F2, #4285F4)',
                                border: 'none',
                                color: '#fff',
                                opacity: !clubShopNewName.trim() || !clubShopNewPrice ? 0.5 : 1,
                              }}
                            >
                              {clubShopProcessing ? 'Creating...' : 'Create Item'}
                            </button>
                          </div>

                          {/* Admin Item List */}
                          {clubShopAdminReport && !clubShopAdminError && (clubShopAdminItems.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40 }}>
                              <div style={{ marginBottom: 12 }}>
                                <Wrench size={48} color="rgba(255,255,255,0.3)" />
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  color: 'rgba(255,255,255,0.5)',
                                  fontWeight: 600,
                                }}
                              >
                                No Shop Items Yet. Create One Above.
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {clubShopAdminItems.map((item) => (
                                <div
                                  key={item.id}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                    borderRadius: 10,
                                    padding: '12px 16px',
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        color: item.is_active ? '#E4E6EB' : '#6B7280',
                                        fontSize: 14,
                                      }}
                                    >
                                      {marketplaceCopy(item.name)}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#8b8d91', marginTop: 2 }}>
                                      {item.price.toLocaleString()} Diamonds •{' '}
                                      <span
                                        style={{
                                          padding: '2px 6px',
                                          borderRadius: 4,
                                          fontSize: 10,
                                          background: 'rgba(255,255,255,0.06)',
                                          color: 'rgba(255,255,255,0.4)',
                                        }}
                                      >
                                        {marketplaceCopy(item.category || 'Time Banks')}
                                      </span>{' '}
                                      • {item.net_purchase_count || 0} Net Sold •{' '}
                                      {fmt(item.revenue)} Diamonds Burned
                                      {(item.refunded_purchase_count || 0) > 0 && (
                                        <span style={{ color: '#FFB7C4' }}>
                                          {' '}
                                          • {item.refunded_purchase_count} Refunded
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleClubShopAdminAction('toggle', item)}
                                      disabled={!!clubShopAdminActionId}
                                      aria-busy={clubShopAdminActionId === item.id}
                                      style={{
                                        padding: '6px 14px',
                                        minHeight: 44,
                                        borderRadius: 20,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: clubShopAdminActionId ? 'not-allowed' : 'pointer',
                                        background: item.is_active
                                          ? 'rgba(0, 212, 255,0.1)'
                                          : 'rgba(255,255,255,0.05)',
                                        border: item.is_active
                                          ? '1px solid rgba(0, 212, 255,0.3)'
                                          : '1px solid rgba(255,255,255,0.1)',
                                        color: item.is_active ? '#00d4ff' : 'rgba(255,255,255,0.4)',
                                      }}
                                    >
                                      {item.is_active ? (
                                        <>
                                          <CheckCircle
                                            size={12}
                                            style={{
                                              display: 'inline',
                                              verticalAlign: 'middle',
                                              marginRight: 3,
                                            }}
                                          />{' '}
                                          Active
                                        </>
                                      ) : (
                                        'Hidden'
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setClubShopDeleteTarget(item)}
                                      disabled={!!clubShopAdminActionId}
                                      aria-haspopup="dialog"
                                      aria-expanded={clubShopDeleteTarget?.id === item.id}
                                      style={{
                                        padding: '6px 14px',
                                        minHeight: 44,
                                        borderRadius: 20,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        cursor: clubShopAdminActionId ? 'not-allowed' : 'pointer',
                                        background: 'rgba(255,59,48,0.1)',
                                        border: '1px solid rgba(255,59,48,0.3)',
                                        color: '#ff6b6b',
                                      }}
                                    >
                                      <Trash2
                                        size={12}
                                        style={{
                                          display: 'inline',
                                          verticalAlign: 'middle',
                                          marginRight: 4,
                                        }}
                                      />{' '}
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ))}

                          {clubShopDeleteTarget && (
                            <div
                              className={shellStyles.dialogBackdrop}
                              onClick={dismissClubShopDeleteDialog}
                              style={{
                                position: 'fixed',
                                inset: 0,
                                zIndex: 9999,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: 20,
                                background: 'rgba(0,0,0,0.78)',
                              }}
                            >
                              <div
                                ref={clubShopDeleteDialogRef}
                                className={shellStyles.dialogPanel}
                                role="dialog"
                                aria-modal="true"
                                aria-labelledby="club-shop-delete-title"
                                aria-describedby="club-shop-delete-description"
                                tabIndex={-1}
                                onClick={(event) => event.stopPropagation()}
                                style={{
                                  width: '100%',
                                  maxWidth: 460,
                                  padding: '24px 22px',
                                  border: '1px solid rgba(255,107,107,0.58)',
                                  background: '#090d12',
                                  boxShadow: '0 24px 70px #000',
                                }}
                              >
                                <h4
                                  id="club-shop-delete-title"
                                  style={{ margin: 0, color: '#FFB1B1', fontSize: 19 }}
                                >
                                  Remove Club Shop Item?
                                </h4>
                                <p
                                  id="club-shop-delete-description"
                                  style={{ margin: '12px 0 0', color: '#C8D5DD', lineHeight: 1.65 }}
                                >
                                  Remove “{clubShopDeleteTarget.name}” From This Club’s Inventory?
                                  Items With Purchase History Cannot Be Deleted; Hide Them Instead To
                                  Preserve The Audit Trail.
                                </p>
                                <div
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                    gap: 10,
                                    marginTop: 22,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={dismissClubShopDeleteDialog}
                                    disabled={!!clubShopAdminActionId}
                                    style={{
                                      minHeight: 44,
                                      border: '1px solid rgba(255,255,255,0.22)',
                                      background: '#111820',
                                      color: '#EAF8FF',
                                      fontWeight: 800,
                                    }}
                                  >
                                    Keep Item
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleClubShopAdminAction('delete', clubShopDeleteTarget)
                                    }
                                    disabled={!!clubShopAdminActionId}
                                    aria-busy={clubShopAdminActionId === clubShopDeleteTarget.id}
                                    style={{
                                      minHeight: 44,
                                      border: '1px solid rgba(255,107,107,0.72)',
                                      background: '#2A0B10',
                                      color: '#FFD5D5',
                                      fontWeight: 900,
                                    }}
                                  >
                                    {clubShopAdminActionId === clubShopDeleteTarget.id
                                      ? 'Removing...'
                                      : 'Remove Item'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Legal Note */}
              <p style={styles.legalNote}>
                Diamonds Are Virtual Currency And Have No Real-World Cash Value.
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                All Purchases Are Final. See our{' '}
                <a href="/terms" style={styles.link}>
                  Terms Of Service
                </a>{' '}
                For Details.
              </p>
            </div>
          </main>
        </div>
      </PageTransition>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STYLES: imported from src/components/diamond-store/diamondStoreStyles.js
// (single source of truth; the former inline duplicate was removed after being
// verified byte-identical to the shared module)
// ═══════════════════════════════════════════════════════════════════════════
