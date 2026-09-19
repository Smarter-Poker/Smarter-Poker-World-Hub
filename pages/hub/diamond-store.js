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
import useHasMounted from '../../src/hooks/useHasMounted';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { usePersistedFilters } from '../../src/hooks/usePersistedFilters';
// Tiny list module on purpose: importing eggVerifiers.js here would pull 28
// server-side database queries into the client bundle just to print a count.
import { EARNABLE_EGG_COUNT } from '../../src/lib/rewards/eggCoverage';
import { marketplaceCopy } from '../../src/lib/store/marketplaceCopy';
import { boundedCommerceFetch } from '../../src/lib/store/boundedCommerceFetch';
import { resolveClubShopProductArt } from '../../src/lib/store/clubShopProductArt';
import {
  checkoutRequestReplacementRequired,
  clubCardCheckoutOfferConfirmation,
  diamondCheckoutOfferConfirmation,
  lifetimeCheckoutOfferConfirmation,
  normalizeVerifiedCheckoutSession,
  normalizeVerifiedCheckoutStatus,
  STRIPE_CHECKOUT_SESSION_ID_RE,
  subscriptionCheckoutOfferConfirmation,
  vipDiamondOfferConfirmation,
} from '../../src/lib/store/verifiedCheckoutUrl.mjs';
import { getVerifiedCheckoutAuthorization } from '../../src/lib/store/checkoutAuthorization';
import {
  classifyVipDiamondPurchaseRefusal,
  normalizeVerifiedDiamondPackages,
  normalizeVerifiedVipDiamondPurchase,
} from '../../src/lib/store/verifiedStoreCatalog.mjs';
import {
  classifyClubPurchaseRefusal,
  getClubDiamondPurchaseProjection,
  normalizeClubCardQuote,
  normalizeVerifiedClubPurchaseSuccess,
  normalizeVerifiedClubShopAccountId,
  normalizeVerifiedClubShopContext,
  normalizeVerifiedClubShopItems,
  normalizeVerifiedClubShopPurchases,
} from '../../src/lib/store/clubCardCheckout.mjs';
import {
  DIAMOND_STOREFRONT_FALLBACK_PACKAGES,
  loadDiamondStorefrontPackages,
  sameDiamondStorefrontOffer,
} from '../../src/lib/store/diamondStorefrontCatalog.mjs';

// God-Mode Stack
import supabase from '../../src/lib/supabase';
import useTrainingBus from '../../src/hooks/useTrainingBus';
import { broadcastSync, listenBroadcast } from '../../src/lib/broadcastSync';
import {
  ensureAuthReady,
  getAccessToken,
  getAuthUser,
  getFreshAccessToken,
} from '../../src/lib/authUtils';
import { acquireScrollLock } from '../../src/lib/scrollLock';
import { useAvatar } from '../../src/contexts/AvatarContext';
import { showStoreToast } from '../../src/components/store/StoreToast';
import { captureStoreEvent } from '../../src/lib/store/storeAnalytics';
import {
  clearCommerceRequestId,
  clearCommerceRequestById,
  getOrCreateCommerceRequestId,
  inspectCommerceRequestRecovery,
  listCommerceRequestRecoverySlots,
  replaceCommerceRequestId,
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
const StoreToast = dynamic(() => import('../../src/components/store/StoreToast'), { ssr: false });
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
import { VIPCard } from '../../src/components/store/StoreCards';
import SmarterStoreShowcase from '../../src/components/diamond-store/SmarterStoreShowcase';
import CheckoutStatusPanel from '../../src/components/diamond-store/CheckoutStatusPanel';
import MarketplaceCommerceNav from '../../src/components/store/MarketplaceCommerceNav';

const MerchStore = dynamic(() => import('../../src/components/store/MerchStore'), {
  loading: () => (
    <div className={shellStyles.loadingPanel} role="status" aria-live="polite">
      <MerchStoreLoadingText />
    </div>
  ),
});

import {
  STANDARD_REWARDS,
  EASTER_EGGS,
  VIP_MEMBERSHIP,
  getVipBenefitsForPlan,
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
const CLUB_CARD_REFRESH_CODES = new Set([
  'CARD_QUOTE_CHANGED',
  'CLUB_ITEM_PRICE_CHANGED',
  'CLUB_ITEM_PRICE_CONFIRMATION_REQUIRED',
  'CLUB_CARD_QUOTE_CONFIRMATION_REQUIRED',
]);
const CLUB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMPTY_COMMERCE_RECOVERY = Object.freeze({ status: 'empty', requestId: null });
const EMPTY_CLUB_SHOP_COLLECTION = Object.freeze([]);
const PROTECTED_TERMS_CHANGED_MESSAGE =
  'A Protected Purchase Recovery Exists For Earlier Terms. The Current Offer Does Not Match It, So This Page Will Not Start Or Verify A Different Purchase.';
const CLUB_ADMIN_CREATABLE_CATEGORIES = Object.freeze(['Time Banks']);
const ALL_THROWABLES_NAME = 'All Throwables Pack (10)';
const isThrowableAdminItem = (item) =>
  Boolean(item) &&
  (String(item.category || '').toLowerCase() === 'throwables' ||
    String(item.item_type || '').toLowerCase() === 'throwable' ||
    item.grant_spec?.type === 'throwable');
const isCanonicalAllThrowablesAdminItem = (item) =>
  isThrowableAdminItem(item) &&
  String(item.name || '')
    .trim()
    .toLowerCase() === ALL_THROWABLES_NAME.toLowerCase() &&
  item.is_active === true;

function vipDiamondPlanKey(plan) {
  if (plan?.interval === 'lifetime') return 'lifetime';
  if (plan?.interval === 'year') return 'yearly';
  if (plan?.interval === 'month') return 'monthly';
  return null;
}

function vipDiamondCommerceIntent(plan, userId) {
  const planKey = vipDiamondPlanKey(plan);
  const cost = Math.round(Number(plan?.price) * 100);
  if (!planKey || !userId || !Number.isSafeInteger(cost) || cost < 0) return null;
  return {
    planKey,
    cost,
    commerceIntent: {
      scope: `vip-${planKey}`,
      userId,
      paymentMethod: 'diamonds',
      intent: { plan: planKey, cost },
    },
  };
}

function clubDiamondCommerceIntent(scope, item, userId, clubId) {
  const price = Number(item?.price);
  if (!scope || !item?.id || !userId || !clubId || !Number.isSafeInteger(price) || price < 0) {
    return null;
  }
  return {
    scope,
    userId,
    paymentMethod: 'diamonds',
    intent: { clubId, itemId: item.id, expectedPrice: price },
  };
}

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
    description:
      'Buy Diamonds To Unlock Premium Features Across Smarter.Poker And Poker Arena: Time Banks, Cosmetics, Club Shop Items And VIP Day Passes. Diamonds Are A Promotional Rewards Currency With No Cash Value.',
  },
  vip: {
    title: 'VIP Membership: Smarter.Poker',
    description:
      'Everything Included With VIP: Every Premium Day Pass, Higher Diamond Caps, 500 Bonus Diamonds A Month And The Full Club Arena Feature Set.',
  },
  merch: {
    title: 'Merch Store: Smarter.Poker',
    description:
      'Official Smarter.Poker Apparel, Card Protectors, Playing Card Decks And Chip Sets, Shipped To You. Real Merchandise Bought With Money, Not A Game Purchase And Not A Wager.',
  },
  rewards: {
    title: 'Smarter Rewards: Smarter.Poker',
    description:
      'Every Way To Earn Diamonds On Smarter.Poker, The Real Daily And Monthly Caps, And Every Hidden Achievement. Diamonds Are A Promotional Rewards Currency With No Cash Value.',
  },
  'club-shop': {
    title: 'Club Shop: Smarter.Poker',
    description:
      'Spend Diamonds On Time Banks, Cosmetics And The Items Your Club Owner Stocks For Their Members. Diamonds Are A Promotional Rewards Currency With No Cash Value, And Nothing Here Is A Wager.',
  },
};

const TAB_SOCIAL_IMAGE = {
  diamonds: '/images/store-v3/diamond-vault-hero.webp',
  vip: '/images/store-v3/vip-hero.webp',
  merch: '/images/store-v3/merch-hero.webp',
  rewards: '/images/store-v3/rewards-hero.webp',
  'club-shop': '/images/store-v3/club-shop-hero.webp',
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
    a: 'Monthly And Yearly VIP Carry Three Honest Monthly Ceilings: 100 Free Rabbit Hunts, 500 Free Throwables, And 120 Extra Time Bank Seconds. Past Those You Pay The Normal Diamond Price. Lifetime VIP Makes Those Three Digital Gameplay Benefits Unlimited, While Every Time Bank Remains A Standard 20-Second Activation With No More Than Two Per Street.',
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
    a: 'Monthly And Yearly VIP Accept All Major Credit And Debit Cards Through Our Secure Stripe Checkout, Including Apple Pay And Google Pay Where Your Device Supports Them. Every VIP Term Also Accepts Diamonds: 1,999 Diamond Monthly, 19,999 Yearly, Or 49,900 Lifetime. Lifetime Card Checkout Is Paused Until Its Refund And Dispute Protections Match The Diamond Path.',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN DIAMOND STORE PAGE
// ═══════════════════════════════════════════════════════════════════════════
export async function getServerSideProps({ res }) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  const fallbackProps = {
    initialDiamondPackages: DIAMOND_STOREFRONT_FALLBACK_PACKAGES,
    initialDiamondCatalogSource: 'fallback',
  };

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return { props: fallbackProps };

    const { createClient } = await import('../../src/lib/supabaseServerClient');
    const result = await loadDiamondStorefrontPackages(createClient(url, key), {
      allowFallback: false,
      cacheMs: 0,
    });
    return {
      props: {
        initialDiamondPackages: result.packages,
        initialDiamondCatalogSource: result.source,
      },
    };
  } catch (error) {
    console.warn('[Diamond Store] Server Catalog Read Failed:', error?.message || error);
    return { props: fallbackProps };
  }
}

/**
 * The words, once a browser is actually waiting for them (AEO phase 3,
 * 2026-09-19). These loading branches render on the server, so the store
 * told every crawler it was still loading. The branch and the box stay
 * exactly as they were, so nothing about the layout or the auth flow
 * changes; only the sentence waits for someone who can read it.
 */
function ClubShopLoadingText() {
  const hasMounted = useHasMounted();
  return hasMounted ? <>Loading Club Shop...</> : null;
}

function MerchStoreLoadingText() {
  const hasMounted = useHasMounted();
  return hasMounted ? <>Loading Merch Store...</> : null;
}

export default function DiamondStorePage({
  initialTab,
  initialDiamondPackages = DIAMOND_STOREFRONT_FALLBACK_PACKAGES,
  initialDiamondCatalogSource = 'fallback',
}) {
  useTrainingBus('diamond-store');
  const router = useRouter();
  const { user: contextUser, initializing: authInitializing } = useAvatar();

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
  const [diamondPackages, setDiamondPackages] = useState(
    Array.isArray(initialDiamondPackages) && initialDiamondPackages.length > 0
      ? initialDiamondPackages
      : DIAMOND_STOREFRONT_FALLBACK_PACKAGES
  );
  const [diamondCatalogState, setDiamondCatalogState] = useState(
    initialDiamondCatalogSource === 'database' ? 'database' : 'loading'
  );
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
  const [vipDiamondRecovery, setVipDiamondRecovery] = useState(EMPTY_COMMERCE_RECOVERY);
  const [diamondMultiplier, setDiamondMultiplier] = useState(1.0);
  const [checkoutReturn, setCheckoutReturn] = useState(null);
  const [checkoutVerificationAttempt, setCheckoutVerificationAttempt] = useState(0);
  const cartOwnerId = useCartStore((state) => state.ownerId);
  const reconciledCheckoutSessionsRef = useRef(new Set());

  useEffect(() => {
    if (!router.isReady || activeTab !== 'vip') return;
    const requestedPlan = Array.isArray(router.query.plan)
      ? router.query.plan[0]
      : router.query.plan;
    if (['vip-monthly', 'vip-yearly', 'vip-lifetime'].includes(requestedPlan)) {
      setSelectedVIP(requestedPlan);
    }
  }, [activeTab, router.isReady, router.query.plan]);

  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  // The server cannot see the browser's persisted Supabase session. Reading
  // that session during the first client render made the Club Shop hydrate as
  // authenticated over signed-out server markup, which triggered React 418 /
  // 423 / 425 and forced a client-side replacement. Keep the first browser
  // render identical to SSR, then resolve the account after hydration.
  const [storeClientReady, setStoreClientReady] = useState(false);
  const activeStoreAccountRef = useRef(null);
  const diamondCardAttemptRef = useRef(0);
  const diamondCardAbortRef = useRef(null);
  const vipCardAttemptRef = useRef(0);
  const vipCardAbortRef = useRef(null);
  const vipDiamondAttemptRef = useRef(0);
  const vipDiamondAbortRef = useRef(null);
  const committedStoreAccountId = storeClientReady
    ? contextUser?.id || (authInitializing ? user?.id || getAuthUser()?.id || null : null)
    : null;
  const clubShopAuthPending = !storeClientReady || authInitializing;

  useEffect(() => {
    setStoreClientReady(true);
  }, []);

  useIsomorphicLayoutEffect(() => {
    activeStoreAccountRef.current = committedStoreAccountId;
    diamondCardAttemptRef.current += 1;
    const invalidatedDiamondCardAttempt = !!diamondCardAbortRef.current;
    diamondCardAbortRef.current?.abort();
    diamondCardAbortRef.current = null;
    vipCardAttemptRef.current += 1;
    const invalidatedVipCardAttempt = !!vipCardAbortRef.current;
    vipCardAbortRef.current?.abort();
    vipCardAbortRef.current = null;
    vipDiamondAttemptRef.current += 1;
    const invalidatedVipDiamondAttempt = !!vipDiamondAbortRef.current;
    vipDiamondAbortRef.current?.abort();
    vipDiamondAbortRef.current = null;
    if (invalidatedDiamondCardAttempt || invalidatedVipCardAttempt || invalidatedVipDiamondAttempt)
      setStoreProcessing(false);
    const nextUser = contextUser?.id === committedStoreAccountId ? contextUser : null;
    setUser(nextUser);
    setAuthResolved(!authInitializing && !committedStoreAccountId);
    setIsVip(false);
    setVipTier(null);
    setVipExpiresAt(null);
    setDiamondBalance(null);
    setDiamondMultiplier(1);
    setCheckoutReturn(null);
    setPendingSpend(null);
    setVipDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
  }, [authInitializing, committedStoreAccountId, contextUser, setStoreProcessing]);

  useEffect(
    () => () => {
      diamondCardAttemptRef.current += 1;
      diamondCardAbortRef.current?.abort();
      diamondCardAbortRef.current = null;
      vipCardAttemptRef.current += 1;
      vipCardAbortRef.current?.abort();
      vipCardAbortRef.current = null;
      vipDiamondAttemptRef.current += 1;
      vipDiamondAbortRef.current?.abort();
      vipDiamondAbortRef.current = null;
    },
    []
  );

  // ═══ Club Shop State ═══
  const [clubShopItems, setClubShopItems] = useState([]);
  const [clubShopPurchases, setClubShopPurchases] = useState([]);
  const [clubDiamondBalance, setClubDiamondBalance] = useState(0);
  const [clubShopLoading, setClubShopLoading] = useState(false);
  const [clubShopLoaded, setClubShopLoaded] = useState(false);
  const [clubShopLoadedAccountId, setClubShopLoadedAccountId] = useState(null);
  const [clubShopBuyTarget, setClubShopBuyTarget] = useState(null);
  const [clubDiamondRecoveryByItem, setClubDiamondRecoveryByItem] = useState({});
  const [clubUnavailableRecoveryItems, setClubUnavailableRecoveryItems] = useState([]);
  const [clubUnavailableRecoveryError, setClubUnavailableRecoveryError] = useState(null);
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
  const rawRouteClubId = Array.isArray(router.query.clubId)
    ? router.query.clubId[0]
    : router.query.clubId;
  const routeClubId = CLUB_ID_RE.test(String(rawRouteClubId || '')) ? String(rawRouteClubId) : null;

  // Admin Manage state
  const [clubShopAdminItems, setClubShopAdminItems] = useState([]);
  const [clubShopAdminLoaded, setClubShopAdminLoaded] = useState(false);
  const [clubShopAdminLoading, setClubShopAdminLoading] = useState(false);
  const [clubShopAdminError, setClubShopAdminError] = useState(null);
  const [clubShopAdminReport, setClubShopAdminReport] = useState(null);
  const [clubShopMaximumCardFundedPrice, setClubShopMaximumCardFundedPrice] = useState(null);
  const [clubShopNewName, setClubShopNewName] = useState('');
  const [clubShopNewPrice, setClubShopNewPrice] = useState('');
  const [clubShopNewDesc, setClubShopNewDesc] = useState('');
  const [clubShopNewCategory, setClubShopNewCategory] = useState('Time Banks');
  const [clubShopNewGrantQty, setClubShopNewGrantQty] = useState('1');
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
  const clubShopPurchaseAttemptRef = useRef(0);
  const clubShopPurchaseAbortRef = useRef(null);
  const clubShopCardAttemptRef = useRef(0);
  const clubShopCardAbortRef = useRef(null);
  const clubShopRouteIdentityRef = useRef(null);
  const clubShopPurchaseOwnerRef = useRef({
    accountId: committedStoreAccountId,
    clubId: clubShopClubId,
  });
  const clubShopAdminLoadingRef = useRef(false);
  const clubShopAdminAbortRef = useRef(null);
  const clubShopAdminActionRef = useRef(null);
  const clubShopAdminActionAttemptRef = useRef(0);
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

  useIsomorphicLayoutEffect(() => {
    if (!router.isReady || activeTab !== 'club-shop') return;
    const nextRouteClubId = routeClubId || null;
    if (clubShopRouteIdentityRef.current === nextRouteClubId) return;
    clubShopRouteIdentityRef.current = nextRouteClubId;
    clubShopLoadRequestRef.current += 1;
    clubShopLoadingRef.current = false;
    if (clubShopLoadTimerRef.current) {
      clearTimeout(clubShopLoadTimerRef.current);
      clubShopLoadTimerRef.current = null;
    }
    clubShopAdminAbortRef.current?.abort();
    clubShopAdminAbortRef.current = null;
    clubShopAdminLoadingRef.current = false;
    clubShopAdminActionAttemptRef.current += 1;
    setClubShopLoadedAccountId(null);
    setClubShopLoaded(false);
    setClubShopLoading(false);
    setClubShopError(null);
    setClubShopItems([]);
    setClubShopPurchases([]);
    setClubDiamondBalance(0);
    setClubShopRole('player');
    setClubShopBuyTarget(null);
    setClubDiamondRecoveryByItem({});
    setClubUnavailableRecoveryItems([]);
    setClubUnavailableRecoveryError(null);
    setClubShopAdminLoaded(false);
    setClubShopAdminLoading(false);
    setClubShopAdminItems([]);
    setClubShopAdminError(null);
    setClubShopAdminReport(null);
    setClubShopMaximumCardFundedPrice(null);
    setClubShopAdminAction(null);
    setClubShopDeleteTarget(null);
    setClubShopSubTab('store');
    setClubShopClubId(nextRouteClubId);
  }, [activeTab, routeClubId, router.isReady, setClubShopAdminAction]);

  useIsomorphicLayoutEffect(() => {
    clubShopPurchaseOwnerRef.current = {
      accountId: committedStoreAccountId,
      clubId: clubShopClubId,
    };
    clubShopPurchaseAttemptRef.current += 1;
    const invalidatedPurchase = !!clubShopPurchaseAbortRef.current;
    const invalidatedCardCheckout = !!clubShopCardAbortRef.current;
    clubShopPurchaseAbortRef.current?.abort();
    clubShopPurchaseAbortRef.current = null;
    clubShopCardAttemptRef.current += 1;
    clubShopCardAbortRef.current?.abort();
    clubShopCardAbortRef.current = null;
    if (clubShopSuccessTimerRef.current) {
      clearTimeout(clubShopSuccessTimerRef.current);
      clubShopSuccessTimerRef.current = null;
    }
    setClubShopSuccess(null);
    setClubShopBuyTarget(null);
    setClubDiamondRecoveryByItem({});
    setClubUnavailableRecoveryItems([]);
    setClubUnavailableRecoveryError(null);
    if (invalidatedPurchase) setClubProcessing(false);
    if (invalidatedCardCheckout) setClubShopCardProcessingId(null);
  }, [clubShopClubId, committedStoreAccountId, setClubProcessing]);

  useIsomorphicLayoutEffect(() => {
    // A private catalog, wallet, purchase history, and admin role are one
    // account-bound snapshot. Never carry them across an auth transition.
    clubShopLoadRequestRef.current += 1;
    clubShopLoadingRef.current = false;
    if (clubShopLoadTimerRef.current) {
      clearTimeout(clubShopLoadTimerRef.current);
      clubShopLoadTimerRef.current = null;
    }
    clubShopAdminAbortRef.current?.abort();
    clubShopAdminAbortRef.current = null;
    clubShopAdminLoadingRef.current = false;
    clubShopAdminActionAttemptRef.current += 1;
    setClubShopLoadedAccountId(null);
    setClubShopLoaded(false);
    setClubShopLoading(false);
    setClubShopError(null);
    setClubShopItems([]);
    setClubShopPurchases([]);
    setClubDiamondBalance(0);
    setClubShopRole('player');
    setClubShopBuyTarget(null);
    setClubDiamondRecoveryByItem({});
    setClubUnavailableRecoveryItems([]);
    setClubUnavailableRecoveryError(null);
    setClubShopAdminLoaded(false);
    setClubShopAdminLoading(false);
    setClubShopAdminItems([]);
    setClubShopAdminError(null);
    setClubShopAdminReport(null);
    setClubShopMaximumCardFundedPrice(null);
    setClubShopAdminAction(null);
    setClubShopDeleteTarget(null);
    setClubShopSubTab('store');
    setClubShopClubId(routeClubId || null);
  }, [committedStoreAccountId, routeClubId, setClubShopAdminAction]);

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
  }, [router.isReady, initialTab, router.query.tab]);

  // A Stripe return URL is only a transport signal. `success=true` is never
  // trusted on its own: the server retrieves the session from Stripe, verifies
  // ownership, and compares the backing store record before this page claims
  // a completed purchase.
  useEffect(() => {
    if (!router.isReady) return undefined;

    const clearCheckoutTransport = () => {
      const cleanPath =
        activeTab === 'club-shop' && routeClubId
          ? `${TAB_ROUTES[activeTab]}?clubId=${encodeURIComponent(routeClubId)}`
          : TAB_ROUTES[activeTab];
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
    if (!STRIPE_CHECKOUT_SESSION_ID_RE.test(rawSession)) {
      setCheckoutReturn({
        status: 'failed',
        message: 'The Checkout Return Did Not Include A Valid Session Reference.',
      });
      clearCheckoutTransport();
      return undefined;
    }

    let cancelled = false;
    let retryTimer = null;
    const controller = new AbortController();
    setCheckoutReturn({ status: 'verifying', sessionId: rawSession });
    // Remove the transport parameters before any network work so a Stripe
    // session reference never lingers in copied URLs, analytics, or referrers.
    clearCheckoutTransport();
    const token = getAccessToken();
    const expectedAccountId = getAuthUser()?.id || null;
    if (!token || !expectedAccountId || expectedAccountId !== user?.id) {
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
              let settled = false;
              const settle = () => {
                if (settled) return;
                settled = true;
                if (retryTimer) window.clearTimeout(retryTimer);
                retryTimer = null;
                controller.signal.removeEventListener('abort', settle);
                resolve();
              };
              retryTimer = window.setTimeout(settle, delay);
              controller.signal.addEventListener('abort', settle, { once: true });
            });
          }
          if (cancelled || controller.signal.aborted) return;
          if (getAuthUser()?.id !== expectedAccountId) {
            throw new Error(
              'Your Player Account Changed While This Payment Was Being Verified. The Protected Request Was Retained.'
            );
          }

          let response;
          try {
            response = await boundedCommerceFetch(
              `/api/store/checkout-status?session_id=${encodeURIComponent(rawSession)}`,
              {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              },
              CHECKOUT_STATUS_REQUEST_TIMEOUT_MS
            );
          } catch (error) {
            if (cancelled || controller.signal.aborted) return;
            if (error?.code === 'COMMERCE_REQUEST_TIMEOUT') {
              if (attempt < CHECKOUT_STATUS_RETRY_DELAYS.length - 1) continue;
              throw new Error('Checkout Verification Timed Out. Try Verification Again.');
            }
            if (error?.name === 'AbortError') return;
            if (attempt < CHECKOUT_STATUS_RETRY_DELAYS.length - 1) continue;
            throw error;
          }

          const body = await response.json().catch(() => null);
          if (!response.ok || !body?.success) {
            throw new Error(body?.error || 'Could Not Verify Checkout Status.');
          }
          if (cancelled) return;
          if (getAuthUser()?.id !== expectedAccountId) {
            throw new Error(
              'Your Player Account Changed While This Payment Was Being Verified. The Protected Request Was Retained.'
            );
          }
          const receipt = normalizeVerifiedCheckoutStatus(body, {
            sessionId: rawSession,
            accountId: expectedAccountId,
          });
          if (!receipt) {
            throw new Error(
              'Checkout Status Returned An Unverified Receipt. The Protected Request Was Retained.'
            );
          }
          if (getAuthUser()?.id !== expectedAccountId) {
            throw new Error(
              'Your Player Account Changed Before Payment Recovery Finished. The Protected Request Was Retained.'
            );
          }

          const status = receipt.status;
          const needsRedemptionReview = receipt.redemptionStatus === 'needs_review';
          const displayStatus = status === 'complete' && needsRedemptionReview ? 'review' : status;
          const verifiedWalletBalance = receipt.walletBalance;
          if (Number.isSafeInteger(verifiedWalletBalance)) {
            setClubDiamondBalance(verifiedWalletBalance);
            window.dispatchEvent(
              new CustomEvent('smarter-poker:diamond-balance', {
                detail: {
                  balance: verifiedWalletBalance,
                  userId: receipt.accountId,
                  source: 'checkout-status',
                },
              })
            );
            broadcastSync('smarter_poker_diamond_sync', 'refresh');
          }
          const isTerminal = status === 'complete' || status === 'failed';
          const recoveryRetired =
            !isTerminal ||
            clearCommerceRequestById({
              userId: receipt.accountId,
              paymentMethod: 'card',
              requestId: receipt.requestId,
            });
          setCheckoutReturn({
            status: displayStatus,
            sessionId: rawSession,
            receipt,
            ...(needsRedemptionReview
              ? {
                  message:
                    'Your Card Payment And Diamond Funding Are Recorded, But The Item Was Not Purchased. Review The Updated Wallet And Current Item Price Before Finishing With Diamonds. Do Not Pay By Card Again.',
                }
              : isTerminal && !recoveryRetired
                ? {
                    message:
                      'The Payment Result Was Verified, But Secure Purchase Recovery Could Not Be Cleared In This Browser. Do Not Start A Second Payment For The Same Purchase.',
                  }
                : {}),
          });
          if (status === 'complete') {
            captureStoreEvent('checkout_complete', {
              route: activeTab,
              type: receipt.type,
              payment_status: receipt.paymentStatus,
              verification_attempts: attempt + 1,
            });
            return;
          }
          if (status === 'failed') {
            captureStoreEvent('checkout_failed', {
              route: activeTab,
              type: receipt.type,
              reason: 'expired',
              verification_attempts: attempt + 1,
            });
            return;
          }

          if (!pendingWasReported) {
            pendingWasReported = true;
            captureStoreEvent('checkout_pending', {
              route: activeTab,
              type: receipt.type,
              payment_status: receipt.paymentStatus,
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
    routeClubId,
    user?.id,
  ]);

  useEffect(() => {
    captureStoreEvent('viewed', { route: activeTab });
  }, [activeTab]);

  // A verified owner-scoped receipt is the only signal allowed to remove paid
  // cart quantities. Exact server-resolved lines preserve anything added or
  // increased while Stripe Checkout was open.
  useEffect(() => {
    if (checkoutReturn?.status !== 'complete' || !user?.id) return;
    const sessionId = checkoutReturn.receipt?.sessionId;
    const purchasedLines = checkoutReturn.receipt?.cartItems;
    if (
      checkoutReturn.receipt?.accountId !== user.id ||
      !sessionId ||
      !Array.isArray(purchasedLines) ||
      purchasedLines.length === 0 ||
      cartOwnerId !== user.id ||
      reconciledCheckoutSessionsRef.current.has(sessionId)
    )
      return;

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
      clubShopPurchaseAttemptRef.current += 1;
      clubShopPurchaseAbortRef.current?.abort();
      clubShopPurchaseAbortRef.current = null;
      clubShopCardAttemptRef.current += 1;
      clubShopCardAbortRef.current?.abort();
      clubShopCardAbortRef.current = null;
    },
    []
  );

  // Bind every private profile field to the currently committed account. A
  // mount-only read leaves account A rendered after the auth provider commits
  // account B, so reset before paint above and accept this read only while the
  // same owner remains current.
  useEffect(() => {
    let cancelled = false;
    const expectedAccountId = committedStoreAccountId;

    if (!expectedAccountId) {
      if (!authInitializing) setAuthResolved(true);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        // Supabase may still be hydrating its persisted session on a cold load.
        // Wait for the supported readiness chain before deciding this is a
        // signed-out storefront for the rest of the page session. Until this
        // resolves, MerchStore must not downgrade an owner-bound persisted cart
        // to "guest" and erase it during the first client render.
        const authUser =
          contextUser?.id === expectedAccountId
            ? contextUser
            : getAuthUser() || (await ensureAuthReady(supabase));
        if (
          cancelled ||
          activeStoreAccountRef.current !== expectedAccountId ||
          authUser?.id !== expectedAccountId
        )
          return;
        setUser(authUser);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_vip, vip_tier, vip_expires_at, diamonds, diamond_multiplier')
          .eq('id', expectedAccountId)
          .maybeSingle();
        if (profileError) throw profileError;
        if (cancelled || activeStoreAccountRef.current !== expectedAccountId) return;
        setIsVip(!!profile?.is_vip);
        setVipTier(profile?.vip_tier || null);
        setVipExpiresAt(profile?.vip_expires_at || null);
        if (profile?.diamonds != null) setDiamondBalance(Number(profile.diamonds));
        if (profile?.diamond_multiplier != null) {
          setDiamondMultiplier(Number(profile.diamond_multiplier));
        }
      } catch (error) {
        if (!cancelled && activeStoreAccountRef.current === expectedAccountId) {
          console.warn('[DiamondStore] Authentication readiness failed:', error?.message || error);
        }
      } finally {
        if (!cancelled && activeStoreAccountRef.current === expectedAccountId) {
          setAuthResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authInitializing, committedStoreAccountId, contextUser]);
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

  const refreshDiamondPackageCatalog = useCallback(async ({ signal } = {}) => {
    const response = await boundedCommerceFetch(
      '/api/club-arena/store-catalog?strict=true',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal,
      },
      12000
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      throw new Error(
        body?.error || 'Current Diamond Pricing Could Not Be Verified. Please Try Again.'
      );
    }
    const verifiedPackages = normalizeVerifiedDiamondPackages(body.diamondPackages);
    if (
      body.diamondCatalogSource !== 'database' ||
      !Array.isArray(body.warnings) ||
      body.warnings.length > 0 ||
      !verifiedPackages
    ) {
      throw new Error('Current Diamond Pricing Could Not Be Verified. Please Try Again.');
    }
    if (signal?.aborted) {
      const abortError = new Error('The Diamond Catalog Request Was Canceled.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    const packages = [...verifiedPackages];
    setDiamondPackages(packages);
    setDiamondCatalogState('database');
    return packages;
  }, []);

  useEffect(() => {
    if (activeTab !== 'diamonds') return undefined;
    const controller = new AbortController();
    refreshDiamondPackageCatalog({ signal: controller.signal }).catch((error) => {
      if (error?.name !== 'AbortError') setDiamondCatalogState('unavailable');
    });
    return () => controller.abort();
  }, [activeTab, refreshDiamondPackageCatalog]);

  const handleDirectCheckout = async (pkg) => {
    if (processingRef.current) return;
    const authUser = getAuthUser();
    if (
      !authUser?.id ||
      authUser.id !== committedStoreAccountId ||
      activeStoreAccountRef.current !== authUser.id
    ) {
      showStoreToast('error', 'Please Sign In To Complete Your Purchase');
      return;
    }
    const expectedAccountId = authUser.id;
    const attemptId = ++diamondCardAttemptRef.current;
    diamondCardAbortRef.current?.abort();
    const controller = new AbortController();
    diamondCardAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      diamondCardAttemptRef.current === attemptId &&
      activeStoreAccountRef.current === expectedAccountId &&
      getAuthUser()?.id === expectedAccountId;
    let commerceIntent = null;
    let checkoutRequestId = null;
    setBusyPackageId(pkg.id);
    setStoreProcessing(true);
    try {
      // Refresh immediately before payment. If an operator repriced,
      // deactivated, renamed, or changed the credit since this card rendered,
      // publish the new rail and require a fresh deliberate click.
      const currentPackages = await refreshDiamondPackageCatalog({ signal: controller.signal });
      if (!attemptIsCurrent()) return;
      const currentPackage = currentPackages.find((entry) => entry.id === pkg.id);
      if (!sameDiamondStorefrontOffer(pkg, currentPackage)) {
        showStoreToast(
          'error',
          'Package Details Changed. Review The Current Offer Before Purchasing.'
        );
        return;
      }
      const offerConfirmation = diamondCheckoutOfferConfirmation(expectedAccountId, [
        { ...currentPackage, quantity: 1 },
      ]);
      if (!offerConfirmation) {
        throw new Error(
          'The Current Diamond Offer Could Not Be Verified. Review It And Try Again.'
        );
      }
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      commerceIntent = {
        scope: `diamonds-${currentPackage.id}`,
        userId: expectedAccountId,
        paymentMethod: 'card',
        intent: { packageId: currentPackage.id, quantity: 1 },
      };
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      captureStoreEvent('checkout_started', {
        route: 'diamonds',
        type: 'diamonds',
        product: currentPackage.id,
        value_usd: Number(currentPackage.price || 0),
      });
      showStoreToast('success', 'Redirecting to secure checkout...');
      const response = await boundedCommerceFetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorization.accessToken}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: currentPackage.id, quantity: 1 }],
          offerConfirmation,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!attemptIsCurrent()) return;
      if (!response.ok) {
        const checkoutError = new Error(
          data?.error?.message || `Request Failed (${response.status})`
        );
        checkoutError.code = data?.error?.code || null;
        throw checkoutError;
      }
      if (!data?.success)
        throw new Error(data?.error?.message || 'Failed to create checkout session');
      const checkoutSession = normalizeVerifiedCheckoutSession(
        data,
        checkoutRequestId,
        offerConfirmation
      );
      if (!checkoutSession) {
        throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
      }
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!confirmedAuthorization) {
        throw new Error('Your Signed-In Account Changed. The Checkout Link Was Not Opened.');
      }
      if (!attemptIsCurrent()) return;
      captureStoreEvent('checkout_session_created', {
        route: 'diamonds',
        type: 'diamonds',
        product: currentPackage.id,
      });
      if (!attemptIsCurrent()) return;
      window.location.assign(checkoutSession.url);
    } catch (err) {
      if (!attemptIsCurrent() || err?.name === 'AbortError') return;
      if (checkoutRequestReplacementRequired(err) && commerceIntent && checkoutRequestId) {
        try {
          replaceCommerceRequestId({ ...commerceIntent, expectedRequestId: checkoutRequestId });
        } catch (replacementError) {
          err = replacementError;
        }
      }
      captureStoreEvent('checkout_failed', { route: 'diamonds', type: 'diamonds' });
      showStoreToast('error', err.message || 'Purchase failed');
    } finally {
      if (diamondCardAbortRef.current === controller) {
        diamondCardAbortRef.current = null;
        setStoreProcessing(false);
      }
    }
  };

  const openVipDiamondReview = (
    plan,
    {
      freshAllowed = true,
      freshBlockedMessage = 'This VIP Purchase Is Not Currently Available.',
    } = {}
  ) => {
    const authUser = getAuthUser();
    if (!authUser?.id) {
      showStoreToast('error', 'Please Sign In To Purchase VIP.');
      return false;
    }
    if (activeStoreAccountRef.current !== authUser.id) {
      showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
      return false;
    }
    const purchaseTerms = vipDiamondCommerceIntent(plan, authUser.id);
    if (!purchaseTerms) {
      showStoreToast(
        'error',
        'The Current VIP Offer Could Not Be Verified. Review It And Try Again.'
      );
      return false;
    }
    const { planKey, cost, commerceIntent } = purchaseTerms;
    let recovery;
    try {
      recovery = inspectCommerceRequestRecovery(commerceIntent);
    } catch (error) {
      setVipDiamondRecovery({
        status: 'unavailable',
        requestId: null,
        planKey,
        cost,
        commerceIntent,
        message: error?.message,
      });
      showStoreToast(
        'error',
        error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
      );
      return false;
    }
    if (recovery.status === 'terms-changed') {
      setVipDiamondRecovery({
        ...recovery,
        planKey,
        cost,
        commerceIntent,
        message: PROTECTED_TERMS_CHANGED_MESSAGE,
      });
      showStoreToast('error', PROTECTED_TERMS_CHANGED_MESSAGE);
      return false;
    }
    const purchaseWasResumed = recovery.status === 'recoverable';
    if (!purchaseWasResumed && !freshAllowed) {
      showStoreToast('error', freshBlockedMessage);
      return false;
    }
    let idempotencyKey = recovery.requestId;
    if (!purchaseWasResumed) {
      try {
        idempotencyKey = getOrCreateCommerceRequestId(commerceIntent);
      } catch (error) {
        showStoreToast(
          'error',
          error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
        );
        return false;
      }
    }
    setVipDiamondRecovery({
      status: 'recoverable',
      requestId: idempotencyKey,
      planKey,
      cost,
      commerceIntent,
      message: purchaseWasResumed
        ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID.'
        : null,
    });
    setPendingSpend({
      kind: 'plan',
      planKey,
      title: purchaseWasResumed
        ? `Verify Previous ${plan.name} Purchase`
        : `Pay For ${plan.name} With Diamonds`,
      cost,
      detail: purchaseWasResumed
        ? `This Reuses The Protected Request For ${Number(cost).toLocaleString()} Diamonds. The Server Will Return Its Original Result Without Starting A Different Purchase.`
        : planKey === 'lifetime'
          ? `${cost.toLocaleString()} Diamonds, Once. Your Membership Stops Having An Expiry Date Rather Than Getting A Longer One, And It Never Renews.`
          : `${cost.toLocaleString()} Diamonds For ${planKey === 'yearly' ? '365' : '30'} Days Of VIP. This Extends Any Membership You Already Have Rather Than Replacing It.`,
      commerceIntent,
      idempotencyKey,
      purchaseWasResumed,
    });
    return true;
  };

  // Monthly and yearly use Stripe subscriptions. Lifetime remains Diamond-only
  // until its cross-method refund/provenance state machine is safe to publish.
  const handleVIPSubscribe = async () => {
    if (processingRef.current) return;
    const plan = selectedVIPPlan;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }

    /* Capability tripwire: never open a card checkout for a term whose complete
       settlement, refund, dispute, and cross-method lifecycle is not enabled. */
    if (plan?.cardCheckoutReady !== true) {
      if (plan?.interval !== 'lifetime') {
        showStoreToast(
          'error',
          'Card Checkout Is Not Verified For This VIP Plan. Please Try Again.'
        );
        return;
      }
      openVipDiamondReview(plan, {
        freshAllowed: vipTier !== 'lifetime',
        freshBlockedMessage: 'Lifetime VIP Already Includes Every VIP Plan.',
      });
      return;
    }

    if (vipTier === 'lifetime') {
      showStoreToast('success', 'Lifetime VIP Already Includes Every VIP Plan.');
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

  const runDiamondPlanPurchase = async (
    planKey,
    idempotencyKey,
    commerceIntent,
    purchaseWasResumed = false
  ) => {
    if (processingRef.current) return;
    const expectedAccountId = commerceIntent?.userId || null;
    const authUser = getAuthUser();
    if (!expectedAccountId || !authUser?.id) {
      showStoreToast('error', 'Please sign in to purchase VIP.');
      return;
    }
    if (authUser.id !== expectedAccountId || activeStoreAccountRef.current !== expectedAccountId) {
      setPendingSpend(null);
      showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
      return false;
    }
    const attemptId = ++vipDiamondAttemptRef.current;
    vipDiamondAbortRef.current?.abort();
    const controller = new AbortController();
    vipDiamondAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      vipDiamondAttemptRef.current === attemptId &&
      activeStoreAccountRef.current === expectedAccountId &&
      getAuthUser()?.id === expectedAccountId;
    setStoreProcessing(true);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!authorization || !attemptIsCurrent()) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      const durableRequestId = getOrCreateCommerceRequestId(commerceIntent);
      if (durableRequestId !== idempotencyKey) {
        setPendingSpend((current) =>
          current?.commerceIntent === commerceIntent
            ? { ...current, idempotencyKey: durableRequestId }
            : current
        );
        throw new Error('Secure Purchase Recovery Was Refreshed. Review And Confirm Again.');
      }
      setPendingSpend((current) =>
        current?.commerceIntent === commerceIntent
          ? { ...current, purchaseWasResumed: true }
          : current
      );
      setVipDiamondRecovery({
        status: 'recoverable',
        requestId: durableRequestId,
        planKey,
        cost: commerceIntent.intent.cost,
        commerceIntent,
        message:
          'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID.',
      });
      const offerConfirmation = vipDiamondOfferConfirmation(expectedAccountId, {
        plan: planKey,
        cost: commerceIntent.intent.cost,
      });
      if (!offerConfirmation) {
        throw new Error(
          'The Reviewed VIP Terms Could Not Be Verified. Review This Purchase Again.'
        );
      }
      captureStoreEvent('diamond_purchase_started', {
        route: 'vip',
        product: planKey,
      });
      const res = await boundedCommerceFetch('/api/store/purchase-vip-with-diamonds', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authorization.accessToken}`,
          'Content-Type': 'application/json',
          'x-idempotency-key': durableRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify({ plan: planKey, offerConfirmation }),
      });
      const data = await res.json().catch(() => null);
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!confirmedAuthorization || !attemptIsCurrent()) {
        throw new Error(
          'Your Signed-In Account Changed. The Original Purchase Still Needs Verification.'
        );
      }
      if (!res.ok) {
        const refusal = classifyVipDiamondPurchaseRefusal(res.status, data, {
          accountId: expectedAccountId,
          requestId: durableRequestId,
        });
        // The API returns required/current on a shortfall: say the number
        // rather than a bare failure the member cannot act on.
        const short =
          data?.required != null && data?.current != null
            ? ` You Need ${Number(data.required).toLocaleString()} And Have ${Number(data.current).toLocaleString()}.`
            : '';
        const refusalError = new Error(
          `${data?.error || `Request Failed (${res.status})`}.${short}`
        );
        refusalError.definitive = refusal.definitive;
        refusalError.commerceRefusal = refusal;
        throw refusalError;
      }
      const verifiedPurchase = normalizeVerifiedVipDiamondPurchase(data, {
        accountId: expectedAccountId,
        requestId: durableRequestId,
        plan: planKey,
        cost: commerceIntent.intent.cost,
      });
      if (verifiedPurchase) {
        let replayProfile = null;
        let replayProfileError = null;
        if (verifiedPurchase.idempotent) {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('is_vip, vip_tier, vip_expires_at, diamonds, diamond_multiplier')
            .eq('id', expectedAccountId)
            .maybeSingle();
          if (!attemptIsCurrent()) return false;
          replayProfile = profile;
          replayProfileError =
            profileError ||
            (!profile ? new Error('Current Marketplace Profile Was Not Found.') : null);
        }
        const recoveryRetired = clearCommerceRequestId({
          ...commerceIntent,
          expectedRequestId: durableRequestId,
        });
        captureStoreEvent('diamond_purchase_complete', {
          route: 'vip',
          product: planKey,
          diamonds_spent: verifiedPurchase.cost,
          idempotent: verifiedPurchase.idempotent,
          recovery_retired: recoveryRetired,
        });
        showStoreToast(
          recoveryRetired && !replayProfileError ? 'success' : 'warning',
          verifiedPurchase.historical
            ? replayProfileError
              ? 'Previous VIP Purchase Verified, But Current Membership Status Could Not Be Refreshed.'
              : 'Previous VIP Purchase Verified. Its Access Period Has Ended.'
            : verifiedPurchase.idempotent && replayProfileError
              ? 'That Purchase Was Already Applied, But Current Membership Status Could Not Be Refreshed.'
              : recoveryRetired
                ? verifiedPurchase.duplicate
                  ? 'That Purchase Was Already Applied. Your Membership Is Active.'
                  : planKey === 'lifetime'
                    ? 'Lifetime VIP Is Active. Your Membership Never Expires.'
                    : `VIP Active. ${verifiedPurchase.daysAdded.toLocaleString()} Days Added.`
                : 'VIP Was Applied And Your Balance Was Updated, But Secure Purchase Recovery Could Not Be Cleared. Do Not Submit This Purchase Again.'
        );
        if (verifiedPurchase.idempotent) {
          if (replayProfile) {
            setIsVip(!!replayProfile.is_vip);
            setVipTier(replayProfile.vip_tier || null);
            setVipExpiresAt(replayProfile.vip_expires_at || null);
            if (replayProfile.diamonds != null) {
              setDiamondBalance(Number(replayProfile.diamonds));
            }
            if (replayProfile.diamond_multiplier != null) {
              setDiamondMultiplier(Number(replayProfile.diamond_multiplier));
            }
          }
        } else {
          setIsVip(true);
          setVipTier(verifiedPurchase.tier);
          setVipExpiresAt(verifiedPurchase.expiresAt);
          setDiamondBalance(verifiedPurchase.newBalance);
        }
        setVipDiamondRecovery((current) =>
          recoveryRetired && current.requestId === durableRequestId
            ? EMPTY_COMMERCE_RECOVERY
            : current
        );
        broadcastSync('smarter_poker_vip_sync', 'refresh_vip');
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        return true;
      }
      showStoreToast(
        'error',
        'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.'
      );
      return false;
    } catch (e) {
      if (!attemptIsCurrent()) return false;
      const refusal = e?.commerceRefusal;
      if (
        e?.definitive === true &&
        refusal?.responseIsBound === true &&
        refusal?.code === 'OFFER_PRICE_CHANGED'
      ) {
        if (purchaseWasResumed) {
          showStoreToast(
            'warning',
            'An Earlier VIP Purchase Is Still Protected. Verify This Same Purchase To Resolve Its Final Status Before Starting Another.'
          );
          return false;
        }
        const recoveryRetired = clearCommerceRequestId({
          ...commerceIntent,
          expectedRequestId: idempotencyKey,
        });
        if (recoveryRetired) {
          setPendingSpend(null);
          setVipDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
          showStoreToast('error', 'The VIP Price Changed. Reloading The Current Plans For Review.');
          router.reload();
        } else {
          showStoreToast(
            'warning',
            'The VIP Price Changed, But Secure Purchase Recovery Could Not Be Cleared. Verify The Protected Purchase Before Trying Again.'
          );
        }
        return false;
      }
      captureStoreEvent('diamond_purchase_failed', { route: 'vip', product: planKey });
      showStoreToast('error', e.message);
      return false;
    } finally {
      if (vipDiamondAbortRef.current === controller) {
        vipDiamondAbortRef.current = null;
        setStoreProcessing(false);
      }
    }
  };

  /** Stripe Checkout for recurring and one-time card plans. */
  const startStripeCheckout = async (plan) => {
    if (processingRef.current) return;
    // Only the plan key is sent; the server resolves the Stripe price ID from
    // its own env config, so the price is never client-controlled.
    const authUser = getAuthUser();
    if (
      !authUser?.id ||
      authUser.id !== committedStoreAccountId ||
      activeStoreAccountRef.current !== authUser.id
    ) {
      showStoreToast('error', 'Please Sign In To Subscribe To VIP.');
      return;
    }
    const expectedAccountId = authUser.id;
    const checkoutType = plan.oneTime ? 'vip_lifetime' : 'subscription';
    const offerConfirmation = plan.oneTime
      ? lifetimeCheckoutOfferConfirmation(expectedAccountId, plan)
      : subscriptionCheckoutOfferConfirmation(expectedAccountId, plan);
    if (!offerConfirmation) {
      showStoreToast(
        'error',
        'The Current VIP Offer Could Not Be Verified. Review It And Try Again.'
      );
      return;
    }
    const commerceIntent = {
      scope: `vip-${plan.id}`,
      userId: expectedAccountId,
      paymentMethod: 'card',
      intent: { plan: plan.id },
    };
    let checkoutRequestId = null;
    const attemptId = ++vipCardAttemptRef.current;
    vipCardAbortRef.current?.abort();
    const controller = new AbortController();
    vipCardAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      vipCardAttemptRef.current === attemptId &&
      activeStoreAccountRef.current === expectedAccountId &&
      getAuthUser()?.id === expectedAccountId;
    setStoreProcessing(true);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      /* A lifetime term is one payment, so it is its own checkout type - the
         server derives Stripe `mode` from this string and a subscription mode
         would renew a membership that never renews. */
      captureStoreEvent('checkout_started', {
        route: 'vip',
        type: checkoutType,
        product: plan.id,
        value_usd: Number(plan.price || 0),
      });
      const response = await boundedCommerceFetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authorization.accessToken}`,
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          type: checkoutType,
          items: [{ plan: plan.id }],
          offerConfirmation,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!attemptIsCurrent()) return;
      if (!response.ok || !data?.success) {
        const checkoutError = new Error(
          data?.error?.message || `Request Failed (${response.status})`
        );
        checkoutError.code = data?.error?.code || null;
        throw checkoutError;
      }
      const checkoutSession = normalizeVerifiedCheckoutSession(
        data,
        checkoutRequestId,
        offerConfirmation
      );
      if (!checkoutSession) {
        throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
      }
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!confirmedAuthorization) {
        throw new Error('Your Signed-In Account Changed. The Checkout Link Was Not Opened.');
      }

      if (!attemptIsCurrent()) return;
      captureStoreEvent('checkout_session_created', {
        route: 'vip',
        type: 'subscription',
        product: plan.id,
      });
      // Recheck after analytics so navigation remains the operation's final owned effect.
      if (!attemptIsCurrent()) return;
      window.location.assign(checkoutSession.url);
    } catch (error) {
      if (!attemptIsCurrent() || error?.name === 'AbortError') return;
      if (checkoutRequestReplacementRequired(error) && checkoutRequestId) {
        /* An expired Stripe session is definitive: no payment can settle under
           this request anymore. Release only that durable identity so the next
           click can create a fresh session. Ambiguous failures keep it. */
        try {
          replaceCommerceRequestId({ ...commerceIntent, expectedRequestId: checkoutRequestId });
        } catch (replacementError) {
          error = replacementError;
        }
      }
      console.warn('VIP subscription error:', error);
      captureStoreEvent('checkout_failed', { route: 'vip', type: 'subscription' });
      showStoreToast('error', error.message || 'Failed to start VIP checkout. Please try again.');
    } finally {
      if (vipCardAbortRef.current === controller) {
        vipCardAbortRef.current = null;
        setStoreProcessing(false);
      }
    }
  };

  // Merchandise checkout lives in src/components/store/MerchStore.jsx: it talks
  // to /api/store/create-checkout-session (card) and /api/store/purchase-with-diamonds
  // (diamonds) directly, so the page no longer needs a merch purchase handler.

  // ═══ Club Shop: Load items from marketplace API ═══
  const loadClubShop = useCallback(
    async (silent = false) => {
      if (clubShopLoadingRef.current) return;
      const requestedClubId = clubShopClubId;
      const requiredRouteClubId = routeClubId;
      const requestId = ++clubShopLoadRequestRef.current;
      clubShopLoadingRef.current = true;
      setClubShopLoadedAccountId(null);
      if (!silent) setClubShopLoading(true);
      if (!silent) setClubShopError(null);
      const loadController = new AbortController();
      const loadTimer = setTimeout(() => {
        if (requestId !== clubShopLoadRequestRef.current) return;
        clubShopLoadRequestRef.current += 1;
        clubShopLoadingRef.current = false;
        loadController.abort();
        setClubShopLoadedAccountId(null);
        if (!silent) {
          setClubShopLoading(false);
          setClubShopLoaded(true);
          setClubShopError('The Club Shop Timed Out. Please Try Again.');
        }
      }, CLUB_SHOP_LOAD_TIMEOUT_MS);
      clubShopLoadTimerRef.current = loadTimer;
      try {
        const expectedAccountId = committedStoreAccountId;
        if (!expectedAccountId) {
          clubShopLoadingRef.current = false;
          setClubShopLoading(false);
          setClubShopLoaded(true);
          return;
        }
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: loadController.signal,
        });
        if (!authorization) {
          throw new Error('Your Signed-In Account Changed. Reload The Club Shop.');
        }
        // Resolve membership on the server. Direct browser-to-Supabase membership
        // reads can be delayed or blocked independently of the authenticated API,
        // which previously left the storefront unusable even while Orders worked.
        const query = requestedClubId ? `?clubId=${encodeURIComponent(requestedClubId)}` : '';
        const response = await fetch(`/api/club-arena/marketplace-items${query}`, {
          headers: { Authorization: `Bearer ${authorization.accessToken}` },
          signal: loadController.signal,
        });
        if (requestId !== clubShopLoadRequestRef.current) return;
        if (!response.ok) throw new Error(`Failed to load club shop (${response.status})`);
        const data = await response.json();
        if (requestId !== clubShopLoadRequestRef.current) return;
        if (!data?.success) throw new Error(data?.error || 'Failed to load club shop');
        const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: loadController.signal,
        });
        const verifiedAccountId = normalizeVerifiedClubShopAccountId(
          data.accountId,
          expectedAccountId
        );
        if (requestId !== clubShopLoadRequestRef.current) return;
        if (!confirmedAuthorization || !verifiedAccountId) {
          throw new Error('The Club Shop Catalog Could Not Be Bound To Your Current Account.');
        }
        const verifiedBalance =
          Number.isSafeInteger(data.balance) && data.balance >= 0 ? data.balance : null;
        const verifiedItems = normalizeVerifiedClubShopItems(data.items, verifiedBalance);
        const verifiedPurchases = normalizeVerifiedClubShopPurchases(data.purchases);
        const verifiedContext = normalizeVerifiedClubShopContext(
          data.clubId ?? null,
          data.role ?? null
        );
        if (!verifiedItems || !verifiedPurchases || !verifiedContext || verifiedBalance === null) {
          throw new Error('The Club Shop Returned An Unverified Catalog Response.');
        }
        const targetClub = verifiedContext.clubId;
        if (
          (requestedClubId && targetClub !== requestedClubId) ||
          (requiredRouteClubId && targetClub !== requiredRouteClubId)
        ) {
          throw new Error('The Club Shop Catalog Did Not Match The Requested Club.');
        }
        if (targetClub) setClubShopClubId(targetClub);

        setClubShopError(null);
        setClubShopItems(
          verifiedItems.map((i) => {
            const listPrice = i.list_price;
            const effectivePrice = i.effective_price;
            return {
              ...i,
              catalog_name: i.name,
              club_id: targetClub,
              name: marketplaceCopy(i.name),
              description: marketplaceCopy(i.description),
              category: marketplaceCopy(i.category),
              is_active: true,
              list_price: listPrice,
              price: effectivePrice,
              on_sale: i.on_sale === true || effectivePrice < listPrice,
              available: i.available === true,
              availability_reason: i.availability_reason || null,
              card_checkout_reason: i.card_checkout_reason || null,
              card_quote: i.card_quote,
              purchase_count: i.purchase_count || 0,
            };
          })
        );
        setClubShopPurchases(verifiedPurchases);
        setClubDiamondBalance(verifiedBalance);
        setClubShopRole(verifiedContext.role);
        setClubShopLoadedAccountId(verifiedAccountId);
        setClubShopLoaded(true);
      } catch (err) {
        if (requestId !== clubShopLoadRequestRef.current) return;
        setClubShopLoadedAccountId(null);
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
    [clubShopClubId, committedStoreAccountId, routeClubId]
  );

  const clubShopSnapshotOwned = Boolean(
    committedStoreAccountId &&
    clubShopLoaded &&
    clubShopLoadedAccountId === committedStoreAccountId &&
    (!routeClubId || clubShopClubId === routeClubId)
  );
  const visibleClubShopItems = clubShopSnapshotOwned ? clubShopItems : EMPTY_CLUB_SHOP_COLLECTION;
  const visibleClubShopPurchases = clubShopSnapshotOwned
    ? clubShopPurchases
    : EMPTY_CLUB_SHOP_COLLECTION;
  const visibleClubDiamondBalance = clubShopSnapshotOwned ? clubDiamondBalance : 0;
  const visibleClubShopRole = clubShopSnapshotOwned ? clubShopRole : 'player';

  const openClubPurchaseReview = (item) => {
    if (!item || clubShopProcessingRef.current) return false;
    const authUser = getAuthUser();
    const targetClubId = item.clubId || item.club_id || clubShopClubId;
    const currentItem = visibleClubShopItems.find((candidate) => candidate.id === item.id);
    if (!authUser?.id || !targetClubId) {
      showStoreToast('error', 'Please Sign In To Buy Club Shop Items.');
      return false;
    }
    if (
      !clubShopSnapshotOwned ||
      authUser.id !== committedStoreAccountId ||
      clubShopLoadedAccountId !== authUser.id ||
      targetClubId !== clubShopClubId ||
      (routeClubId && targetClubId !== routeClubId) ||
      clubShopPurchaseOwnerRef.current.accountId !== authUser.id ||
      clubShopPurchaseOwnerRef.current.clubId !== targetClubId ||
      !currentItem ||
      currentItem.club_id !== targetClubId ||
      currentItem.price !== item.price
    ) {
      showStoreToast('error', 'The Club Shop Changed. Reload The Current Club Before Purchasing.');
      return false;
    }
    const commerceIntent = clubDiamondCommerceIntent(
      `club-${currentItem.id}`,
      currentItem,
      authUser.id,
      targetClubId
    );
    if (!commerceIntent) {
      showStoreToast('error', 'The Current Club Offer Could Not Be Verified. Reload The Shop.');
      return false;
    }
    let recovery;
    try {
      recovery = inspectCommerceRequestRecovery(commerceIntent);
    } catch (error) {
      showStoreToast(
        'error',
        error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
      );
      return false;
    }
    if (recovery.status === 'terms-changed') {
      setClubDiamondRecoveryByItem((current) => ({
        ...current,
        [currentItem.id]: {
          ...recovery,
          commerceIntent,
          message: PROTECTED_TERMS_CHANGED_MESSAGE,
        },
      }));
      showStoreToast('error', PROTECTED_TERMS_CHANGED_MESSAGE);
      return false;
    }
    const purchaseWasResumed = recovery.status === 'recoverable';
    if (!purchaseWasResumed) {
      if (currentItem.available !== true) {
        showStoreToast('error', 'This Item Is Not Available For Purchase.');
        return false;
      }
      const diamondProjection = getClubDiamondPurchaseProjection(
        currentItem.price,
        visibleClubDiamondBalance
      );
      if (
        Number(currentItem.price) !== 0 &&
        (!diamondProjection || diamondProjection.hasDebt || diamondProjection.shortfall > 0)
      ) {
        showStoreToast('error', 'Your Verified Diamond Balance Cannot Fund This Purchase.');
        return false;
      }
    }
    let purchaseRequestId = recovery.requestId;
    if (!purchaseWasResumed) {
      try {
        purchaseRequestId = getOrCreateCommerceRequestId(commerceIntent);
      } catch (error) {
        showStoreToast(
          'error',
          error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
        );
        return false;
      }
    }
    setClubDiamondRecoveryByItem((current) => ({
      ...current,
      [currentItem.id]: {
        status: 'recoverable',
        requestId: purchaseRequestId,
        commerceIntent,
        message: purchaseWasResumed
          ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID.'
          : null,
      },
    }));
    setClubShopBuyTarget({
      ...currentItem,
      clubId: targetClubId,
      commerceIntent,
      purchaseRequestId,
      purchaseWasResumed,
    });
    return true;
  };

  // ═══ Club Shop: Purchase handler ═══
  const handleClubPurchase = async (purchaseTarget = clubShopBuyTarget) => {
    const targetClubId = purchaseTarget?.clubId || purchaseTarget?.club_id || clubShopClubId;
    if (!purchaseTarget || !targetClubId || clubShopProcessingRef.current) return;
    const authUser = getAuthUser();
    const reviewedIntent = purchaseTarget.commerceIntent?.intent;
    const currentItem = visibleClubShopItems.find(
      (candidate) => candidate.id === purchaseTarget.id
    );
    if (
      !authUser?.id ||
      !clubShopSnapshotOwned ||
      authUser.id !== committedStoreAccountId ||
      clubShopLoadedAccountId !== authUser.id ||
      targetClubId !== clubShopClubId ||
      (routeClubId && targetClubId !== routeClubId) ||
      clubShopPurchaseOwnerRef.current.accountId !== authUser.id ||
      clubShopPurchaseOwnerRef.current.clubId !== targetClubId ||
      !currentItem ||
      currentItem.club_id !== targetClubId ||
      currentItem.price !== Number(purchaseTarget.price) ||
      purchaseTarget.commerceIntent?.userId !== authUser.id ||
      reviewedIntent?.clubId !== targetClubId ||
      reviewedIntent?.itemId !== purchaseTarget.id ||
      reviewedIntent?.expectedPrice !== Number(purchaseTarget.price)
    ) {
      setClubShopBuyTarget(null);
      showStoreToast('error', 'Your Signed-In Account Changed. Review This Purchase Again.');
      return;
    }
    const expectedAccountId = authUser.id;
    const expectedClubId = targetClubId;
    let recovery;
    try {
      recovery = inspectCommerceRequestRecovery(purchaseTarget.commerceIntent);
    } catch (error) {
      showStoreToast(
        'error',
        error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.'
      );
      return;
    }
    if (
      recovery.status !== 'recoverable' ||
      recovery.requestId !== purchaseTarget.purchaseRequestId
    ) {
      showStoreToast(
        'error',
        recovery.status === 'terms-changed'
          ? PROTECTED_TERMS_CHANGED_MESSAGE
          : 'The Protected Purchase Identity Changed. Review The Current Offer Again.'
      );
      return;
    }
    const purchaseWasResumed = purchaseTarget.purchaseWasResumed === true;
    if (!purchaseWasResumed) {
      if (purchaseTarget.available !== true) {
        showStoreToast('error', 'This Item Is Not Available For Purchase.');
        return;
      }
      const diamondProjection = getClubDiamondPurchaseProjection(
        purchaseTarget.price,
        visibleClubDiamondBalance
      );
      if (
        Number(purchaseTarget.price) !== 0 &&
        (!diamondProjection || diamondProjection.hasDebt || diamondProjection.shortfall > 0)
      ) {
        showStoreToast('error', 'Your Verified Diamond Balance Cannot Fund This Purchase.');
        return;
      }
    }
    const attemptId = ++clubShopPurchaseAttemptRef.current;
    clubShopPurchaseAbortRef.current?.abort();
    const controller = new AbortController();
    clubShopPurchaseAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      clubShopPurchaseAttemptRef.current === attemptId &&
      clubShopPurchaseOwnerRef.current.accountId === expectedAccountId &&
      clubShopPurchaseOwnerRef.current.clubId === expectedClubId &&
      getAuthUser()?.id === expectedAccountId;
    setClubProcessing(true);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!authorization) {
        setClubShopBuyTarget(null);
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }

      const idempotencyKey = getOrCreateCommerceRequestId(purchaseTarget.commerceIntent);
      if (idempotencyKey !== purchaseTarget.purchaseRequestId) {
        setClubShopBuyTarget((current) =>
          current?.commerceIntent === purchaseTarget.commerceIntent
            ? { ...current, purchaseRequestId: idempotencyKey }
            : current
        );
        throw new Error('Secure Purchase Recovery Was Refreshed. Review And Confirm Again.');
      }
      setClubShopBuyTarget((current) =>
        current?.purchaseRequestId === idempotencyKey
          ? { ...current, purchaseWasResumed: true }
          : current
      );
      captureStoreEvent('club_purchase_started', {
        route: 'club-shop',
        product: purchaseTarget.id,
        diamonds_spent: Number(purchaseTarget.price || 0),
        currency: 'diamonds',
      });
      const response = await boundedCommerceFetch('/api/club-arena/marketplace-purchase', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authorization.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          clubId: targetClubId,
          itemId: purchaseTarget.id,
          expectedPrice: Number(purchaseTarget.price),
        }),
      });
      const responseData = await response
        .json()
        .catch(() => ({ success: false, error: `HTTP ${response.status}` }));
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!confirmedAuthorization) {
        const accountChangedError = new Error(
          'Your Signed-In Account Changed. The Original Purchase Still Needs Verification.'
        );
        accountChangedError.ambiguous = true;
        throw accountChangedError;
      }
      if (!response.ok || !responseData.success) {
        const refusal = classifyClubPurchaseRefusal(response.status, responseData, {
          accountId: expectedAccountId,
          requestId: idempotencyKey,
        });
        if (refusal.refreshInventory) {
          setClubShopBuyTarget(null);
          clubShopLoadingRef.current = false;
          await loadClubShop(true);
        }
        const purchaseError = new Error(
          'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.'
        );
        purchaseError.ambiguous = true;
        throw purchaseError;
      }

      const verifiedPurchase = normalizeVerifiedClubPurchaseSuccess(responseData, {
        accountId: expectedAccountId,
        requestId: idempotencyKey,
        clubId: targetClubId,
        itemId: purchaseTarget.id,
        name: purchaseTarget.catalog_name,
        itemType: purchaseTarget.item_type,
        price: purchaseTarget.price,
      });
      if (!verifiedPurchase) {
        const verificationError = new Error(
          'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.'
        );
        verificationError.ambiguous = true;
        throw verificationError;
      }
      if (!attemptIsCurrent()) return;

      const pricePaid = verifiedPurchase.pricePaid;
      const recoveryRetired = clearCommerceRequestId({
        ...purchaseTarget.commerceIntent,
        expectedRequestId: idempotencyKey,
      });
      if (recoveryRetired) {
        setClubDiamondRecoveryByItem((current) => ({
          ...current,
          [purchaseTarget.id]: EMPTY_COMMERCE_RECOVERY,
        }));
      }
      if (!recoveryRetired) {
        showStoreToast(
          'warning',
          'The Purchase Was Verified, But Secure Recovery Could Not Be Cleared. Do Not Submit It Again Until The Store Refreshes.'
        );
      }
      captureStoreEvent('club_purchase_complete', {
        route: 'club-shop',
        product: purchaseTarget.id,
        diamonds_spent: pricePaid,
        currency: verifiedPurchase.currency,
      });
      setClubShopSuccess(
        `Purchased ${marketplaceCopy(purchaseTarget.name)} For ${pricePaid.toLocaleString()} Diamonds!`
      );
      if (clubShopSuccessTimerRef.current) clearTimeout(clubShopSuccessTimerRef.current);
      clubShopSuccessTimerRef.current = setTimeout(() => setClubShopSuccess(null), 2500);
      setClubDiamondBalance(verifiedPurchase.newBalance);
      // The Club Shop spends the platform diamond wallet, so notify the same
      // cross-tab channel as every other diamond purchase.
      broadcastSync('smarter_poker_diamond_sync', 'refresh');
      setClubShopBuyTarget(null);
      clubShopLoadingRef.current = false;
      loadClubShop(true);
    } catch (err) {
      if (!attemptIsCurrent() || err?.name === 'AbortError') return;
      captureStoreEvent('club_purchase_failed', { route: 'club-shop' });
      showStoreToast(
        'error',
        err?.ambiguous || err?.code === 'COMMERCE_REQUEST_TIMEOUT'
          ? 'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.'
          : err.message || 'Purchase Failed'
      );
    } finally {
      if (clubShopPurchaseAbortRef.current === controller) {
        clubShopPurchaseAbortRef.current = null;
        setClubProcessing(false);
      }
    }
  };

  const handleClubCardCheckout = async (item) => {
    if (!item || clubShopCardProcessingId || clubShopProcessingRef.current) return;
    const expectedAccountId = committedStoreAccountId;
    const expectedClubId = clubShopClubId;
    const currentItem = visibleClubShopItems.find((candidate) => candidate.id === item.id);
    if (!expectedAccountId || !clubShopClubId) {
      showStoreToast('error', 'Please Sign In To Buy Club Shop Items.');
      return;
    }
    if (
      !clubShopSnapshotOwned ||
      clubShopLoadedAccountId !== expectedAccountId ||
      getAuthUser()?.id !== expectedAccountId ||
      clubShopPurchaseOwnerRef.current.accountId !== expectedAccountId ||
      clubShopPurchaseOwnerRef.current.clubId !== expectedClubId ||
      (routeClubId && expectedClubId !== routeClubId) ||
      !currentItem ||
      currentItem.club_id !== expectedClubId ||
      currentItem.price !== item.price
    ) {
      showStoreToast('error', 'The Club Shop Changed. Reload The Current Club Before Purchasing.');
      return;
    }
    if (Number(visibleClubDiamondBalance) < 0) {
      showStoreToast(
        'error',
        'Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above.'
      );
      return;
    }
    if (currentItem.available !== true) {
      showStoreToast('error', 'This Item Is Not Available For Purchase.');
      return;
    }
    const cardQuote = normalizeClubCardQuote(currentItem.card_quote);
    if (!cardQuote) {
      showStoreToast('error', 'This Item Is Above The Current Card Checkout Limit.');
      return;
    }
    const offerConfirmation = clubCardCheckoutOfferConfirmation(
      expectedAccountId,
      [
        {
          packageId: cardQuote.packageId,
          quantity: cardQuote.quantity,
          unitCents: cardQuote.unitPriceCents,
          diamonds: cardQuote.baseDiamonds,
          bonus: cardQuote.bonusDiamonds,
        },
      ],
      {
        clubId: expectedClubId,
        itemId: currentItem.id,
        itemPriceDiamonds: Number(currentItem.price),
        cardChargeCents: cardQuote.cardChargeCents,
      }
    );
    if (
      !offerConfirmation ||
      offerConfirmation.totalCents !== cardQuote.cardChargeCents ||
      offerConfirmation.totalDiamonds + offerConfirmation.totalBonus !== cardQuote.diamondsPurchased
    ) {
      showStoreToast(
        'error',
        'The Current Card Funding Quote Could Not Be Verified. Reload The Shop.'
      );
      return;
    }
    const commerceIntent = {
      scope: `club-card-${currentItem.id}`,
      userId: expectedAccountId,
      paymentMethod: 'card',
      intent: {
        clubId: expectedClubId,
        itemId: currentItem.id,
      },
    };
    let checkoutRequestId = null;
    const attemptId = ++clubShopCardAttemptRef.current;
    clubShopCardAbortRef.current?.abort();
    const controller = new AbortController();
    clubShopCardAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      clubShopCardAttemptRef.current === attemptId &&
      clubShopPurchaseOwnerRef.current.accountId === expectedAccountId &&
      clubShopPurchaseOwnerRef.current.clubId === expectedClubId &&
      getAuthUser()?.id === expectedAccountId;
    setClubShopCardProcessingId(currentItem.id);
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
      captureStoreEvent('checkout_started', {
        route: 'club-shop',
        type: 'card-funded-item',
        product: currentItem.id,
        value_usd: cardQuote.cardCharge,
      });
      const origin = window.location.origin;
      const response = await boundedCommerceFetch('/api/store/create-checkout-session', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authorization.accessToken}`,
          'Content-Type': 'application/json',
          'X-Checkout-Request-ID': checkoutRequestId,
        },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'diamonds',
          items: [{ packageId: cardQuote.packageId, quantity: cardQuote.quantity }],
          offerConfirmation,
          redemptionIntent: {
            kind: 'club_shop',
            clubId: expectedClubId,
            itemId: currentItem.id,
            expectedPrice: Number(currentItem.price),
            expectedCardChargeCents: cardQuote.cardChargeCents,
          },
          successUrl: `${origin}${TAB_ROUTES['club-shop']}?clubId=${encodeURIComponent(expectedClubId)}&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}${TAB_ROUTES['club-shop']}?clubId=${encodeURIComponent(expectedClubId)}&canceled=true`,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!attemptIsCurrent()) return;
      if (!response.ok || !data?.success) {
        const checkoutError = new Error(data?.error?.message || 'Could Not Start Card Checkout.');
        checkoutError.code = data?.error?.code || null;
        throw checkoutError;
      }
      const checkoutSession = normalizeVerifiedCheckoutSession(
        data,
        checkoutRequestId,
        offerConfirmation
      );
      if (!checkoutSession) {
        throw new Error('Checkout Session Could Not Be Bound To This Purchase Request.');
      }
      const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!confirmedAuthorization) {
        throw new Error('Your Signed-In Account Changed. The Checkout Link Was Not Opened.');
      }
      if (!attemptIsCurrent()) return;
      window.location.assign(checkoutSession.url);
    } catch (error) {
      if (!attemptIsCurrent() || error?.name === 'AbortError') return;
      if (checkoutRequestReplacementRequired(error) && checkoutRequestId) {
        try {
          replaceCommerceRequestId({ ...commerceIntent, expectedRequestId: checkoutRequestId });
        } catch (replacementError) {
          error = replacementError;
        }
      }
      if (CLUB_CARD_REFRESH_CODES.has(error?.code)) {
        clubShopLoadingRef.current = false;
        await loadClubShop(true);
        if (!attemptIsCurrent()) return;
      }
      showStoreToast('error', error.message || 'Could Not Start Card Checkout.');
    } finally {
      if (clubShopCardAbortRef.current === controller) {
        clubShopCardAbortRef.current = null;
        setClubShopCardProcessingId(null);
      }
    }
  };

  useEffect(() => {
    if (activeTab !== 'club-shop' || !['complete', 'review'].includes(checkoutReturn?.status))
      return;
    loadClubShop(true);
  }, [activeTab, checkoutReturn?.status, loadClubShop]);

  // ═══ Club Shop: Admin: load all items (active + hidden) ═══
  const loadClubShopAdmin = useCallback(async () => {
    const requestAccountId = committedStoreAccountId;
    const requestClubId = clubShopClubId;
    if (
      !clubShopSnapshotOwned ||
      !requestAccountId ||
      !requestClubId ||
      clubShopAdminLoadingRef.current ||
      !['owner', 'admin'].includes(visibleClubShopRole) ||
      (routeClubId && requestClubId !== routeClubId) ||
      getAuthUser()?.id !== requestAccountId
    ) {
      return false;
    }
    const controller = new AbortController();
    let timedOut = false;
    const requestIsCurrent = () =>
      clubShopPurchaseOwnerRef.current.accountId === requestAccountId &&
      clubShopPurchaseOwnerRef.current.clubId === requestClubId &&
      getAuthUser()?.id === requestAccountId;
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
      if (controller.signal.aborted || !requestIsCurrent()) {
        return false;
      }
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
      setClubShopMaximumCardFundedPrice(
        Number.isSafeInteger(data.maximumCardFundedPrice) && data.maximumCardFundedPrice > 0
          ? data.maximumCardFundedPrice
          : null
      );
      setClubShopAdminLoaded(true);
      return true;
    } catch (err) {
      if (!requestIsCurrent() || (controller.signal.aborted && !timedOut)) return false;
      console.warn('[Club Shop Admin]', err);
      setClubShopAdminItems([]);
      setClubShopAdminReport(null);
      setClubShopMaximumCardFundedPrice(null);
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
  }, [
    clubShopClubId,
    clubShopSnapshotOwned,
    committedStoreAccountId,
    routeClubId,
    visibleClubShopRole,
  ]);

  useEffect(() => {
    clubShopAdminAbortRef.current?.abort();
    clubShopAdminAbortRef.current = null;
    clubShopAdminLoadingRef.current = false;
    setClubShopAdminLoading(false);
    setClubShopAdminLoaded(false);
    setClubShopAdminItems([]);
    setClubShopAdminReport(null);
    setClubShopMaximumCardFundedPrice(null);
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
      const expectedAccountId = committedStoreAccountId;
      const expectedClubId = clubShopClubId;
      if (
        !clubShopSnapshotOwned ||
        !expectedAccountId ||
        !expectedClubId ||
        !['owner', 'admin'].includes(visibleClubShopRole) ||
        item.club_id !== expectedClubId ||
        (routeClubId && expectedClubId !== routeClubId) ||
        clubShopPurchaseOwnerRef.current.accountId !== expectedAccountId ||
        clubShopPurchaseOwnerRef.current.clubId !== expectedClubId ||
        getAuthUser()?.id !== expectedAccountId
      ) {
        showStoreToast('error', 'The Club Shop Changed. Reload The Current Club Before Managing.');
        return;
      }
      if (isThrowableAdminItem(item)) {
        showStoreToast(
          'warning',
          'Throwable Offers Are Platform Managed And Cannot Be Hidden Or Deleted.'
        );
        return;
      }
      const actionAttemptId = ++clubShopAdminActionAttemptRef.current;
      const actionIsCurrent = () =>
        clubShopAdminActionAttemptRef.current === actionAttemptId &&
        clubShopPurchaseOwnerRef.current.accountId === expectedAccountId &&
        clubShopPurchaseOwnerRef.current.clubId === expectedClubId &&
        getAuthUser()?.id === expectedAccountId;
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
        if (!actionIsCurrent()) {
          return;
        }
        if (!response.ok || !data.success) {
          const message = data.hasSales
            ? 'Items With Purchase History Cannot Be Deleted. Hide This Item Instead.'
            : data.error || `HTTP ${response.status}`;
          throw new Error(message);
        }
        if (action === 'delete') {
          setClubShopDeleteTarget(null);
          showStoreToast(
            'success',
            `${marketplaceCopy(item.name)} Was Removed From The Club Shop.`
          );
        }
        await Promise.all([loadClubShopAdmin(), loadClubShop(true)]);
      } catch (error) {
        if (!actionIsCurrent()) return;
        showStoreToast('error', error.message || 'The Club Shop Item Could Not Be Updated.');
      } finally {
        if (clubShopAdminActionAttemptRef.current === actionAttemptId) {
          setClubShopAdminAction(null);
        }
      }
    },
    [
      clubShopClubId,
      clubShopSnapshotOwned,
      committedStoreAccountId,
      loadClubShop,
      loadClubShopAdmin,
      routeClubId,
      setClubShopAdminAction,
      visibleClubShopRole,
    ]
  );

  const clubShopIsAdmin = ['owner', 'admin'].includes(visibleClubShopRole);

  // ═══ Club Shop: Auto-load when tab is restored/deep-linked ═══
  // activeTab is persisted, so a user can land directly on 'club-shop'
  // without ever clicking the tab button (which is the only other trigger).
  useEffect(() => {
    if (
      activeTab === 'club-shop' &&
      committedStoreAccountId &&
      (!routeClubId || clubShopClubId === routeClubId) &&
      (!clubShopLoaded || clubShopLoadedAccountId !== committedStoreAccountId) &&
      !clubShopLoadingRef.current
    ) {
      loadClubShop();
    }
  }, [
    activeTab,
    clubShopClubId,
    clubShopLoaded,
    clubShopLoadedAccountId,
    committedStoreAccountId,
    loadClubShop,
    routeClubId,
  ]);

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
  useEffect(() => {
    const purchaseTerms = vipDiamondCommerceIntent(selectedVIPPlan, committedStoreAccountId);
    if (!purchaseTerms || selectedVIPPlan?.diamondCheckoutReady !== true) {
      setVipDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
      return;
    }
    const { planKey, cost, commerceIntent } = purchaseTerms;
    try {
      const recovery = inspectCommerceRequestRecovery(commerceIntent);
      setVipDiamondRecovery({
        ...recovery,
        planKey,
        cost,
        commerceIntent,
        message:
          recovery.status === 'terms-changed'
            ? PROTECTED_TERMS_CHANGED_MESSAGE
            : recovery.status === 'recoverable'
              ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID Even If Your Current Balance Or VIP Status Changed.'
              : null,
      });
    } catch (error) {
      setVipDiamondRecovery({
        status: 'unavailable',
        requestId: null,
        planKey,
        cost,
        commerceIntent,
        message: error?.message || 'Secure Purchase Recovery Is Unavailable In This Browser.',
      });
    }
  }, [committedStoreAccountId, selectedVIP, selectedVIPPlan]);

  useEffect(() => {
    if (!clubShopSnapshotOwned || !committedStoreAccountId || !clubShopClubId) {
      setClubDiamondRecoveryByItem({});
      setClubUnavailableRecoveryItems([]);
      setClubUnavailableRecoveryError(null);
      return;
    }
    const nextRecovery = {};
    for (const item of visibleClubShopItems) {
      const commerceIntent = clubDiamondCommerceIntent(
        `club-${item.id}`,
        item,
        committedStoreAccountId,
        clubShopClubId
      );
      if (!commerceIntent) continue;
      try {
        const recovery = inspectCommerceRequestRecovery(commerceIntent);
        nextRecovery[item.id] = {
          ...recovery,
          commerceIntent,
          message:
            recovery.status === 'terms-changed'
              ? PROTECTED_TERMS_CHANGED_MESSAGE
              : recovery.status === 'recoverable'
                ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID.'
                : null,
        };
      } catch (error) {
        nextRecovery[item.id] = {
          status: 'unavailable',
          requestId: null,
          commerceIntent,
          message: error?.message || 'Secure Purchase Recovery Is Unavailable In This Browser.',
        };
      }
    }
    try {
      const currentItemIds = new Set(visibleClubShopItems.map((item) => item.id));
      const unavailableByItemId = new Map();
      const recoverySlots = listCommerceRequestRecoverySlots({
        userId: committedStoreAccountId,
        paymentMethod: 'diamonds',
        scopePrefix: 'club-',
      });
      for (const slot of recoverySlots) {
        const recoveryClubId = String(slot.intent?.clubId || '');
        const recoveryItemId = String(slot.intent?.itemId || '');
        const recoveryPrice = slot.intent?.expectedPrice;
        if (
          slot.scope.startsWith('club-detail-') ||
          slot.scope !== `club-${recoveryItemId}` ||
          recoveryClubId !== clubShopClubId ||
          !CLUB_ID_RE.test(recoveryItemId) ||
          !Number.isSafeInteger(recoveryPrice) ||
          recoveryPrice < 0 ||
          currentItemIds.has(recoveryItemId)
        ) {
          continue;
        }
        unavailableByItemId.set(recoveryItemId, Object.freeze({ itemId: recoveryItemId }));
      }
      setClubUnavailableRecoveryItems(Array.from(unavailableByItemId.values()));
      setClubUnavailableRecoveryError(null);
    } catch (error) {
      setClubUnavailableRecoveryItems([]);
      setClubUnavailableRecoveryError(
        error?.message || 'Secure Purchase Recovery Could Not Be Read In This Browser.'
      );
    }
    setClubDiamondRecoveryByItem(nextRecovery);
  }, [clubShopClubId, clubShopSnapshotOwned, committedStoreAccountId, visibleClubShopItems]);

  const lifetimeSelected = selectedVIPPlan?.interval === 'lifetime';
  const selectedVipHasExactRecovery =
    vipDiamondRecovery.status === 'recoverable' &&
    vipDiamondRecovery.planKey === vipDiamondPlanKey(selectedVIPPlan);
  const vipRecoveryBlocksPurchase = ['terms-changed', 'terms-unavailable', 'unavailable'].includes(
    vipDiamondRecovery.status
  );
  const displayedVipBenefits = getVipBenefitsForPlan(selectedVIPPlan?.interval);
  const vipCardReady = selectedVIPPlan?.cardCheckoutReady === true;
  const vipSubscribeLabel = vipCardReady
    ? lifetimeSelected
      ? `Buy VIP Lifetime With Card: $${Number(selectedVIPPlan?.price || 499).toFixed(2)} Once`
      : `Subscribe With Card: $${Number(selectedVIPPlan?.price || 19.99).toFixed(2)}/${selectedVIPPlan?.interval === 'year' ? 'Year' : 'Month'}`
    : selectedVipHasExactRecovery
      ? 'Verify Purchase'
      : `Lifetime VIP Is Bought With Diamonds: ${Math.round(Number(selectedVIPPlan?.price || 0) * 100).toLocaleString()}`;
  const vipPrimaryBlocked =
    vipRecoveryBlocksPurchase ||
    (vipCardReady && selectedVipHasExactRecovery) ||
    (vipTier === 'lifetime' && (vipCardReady || !selectedVipHasExactRecovery));
  const clubShopBuyArt = clubShopBuyTarget ? resolveClubShopProductArt(clubShopBuyTarget) : null;

  // One Marketplace commerce footer per route, declared once and placed once.
  // Page 1 keeps its accepted position directly under the Diamond showcase.
  // The four sibling tab routes render the same element after their content so
  // it lands at the foot of the page instead of between the hero and the first
  // product card, which is where the default rail used to sit.
  const marketplaceCommerceFooter = (
    <MarketplaceCommerceNav active="store" variant="pageFooter" />
  );

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

          <main
            className={`store-redesign-content ${shellStyles.root}`}
            data-marketplace-route={TAB_ROUTES[activeTab]}
            data-title-case-strategy="css"
          >
            <CheckoutStatusPanel
              state={checkoutReturn}
              onDismiss={() => setCheckoutReturn(null)}
              onRetry={() => setCheckoutVerificationAttempt((attempt) => attempt + 1)}
            />
            <SmarterStoreShowcase
              activeTab={activeTab}
              packages={diamondPackages}
              catalogState={diamondCatalogState}
              isProcessing={isProcessing || diamondCatalogState !== 'database'}
              busyPackageId={busyPackageId}
              onBuy={handleDirectCheckout}
            />

            {activeTab === 'diamonds' && marketplaceCommerceFooter}

            {/* Main Content (non-diamonds tabs) */}
            <div
              className={shellStyles.contentShell}
              data-store-section={activeTab}
              style={{
                ...styles.content,
                ...(activeTab === 'vip' ? { paddingTop: 8 } : {}),
              }}
            >
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
                      className={shellStyles.vipStatusBar}
                      style={{
                        background: '#020403',
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
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ color: '#FFD700', fontWeight: 700, fontSize: 15 }}>
                          You Are Already A VIP Member
                          {vipTier ? `: ${marketplaceCopy(vipTier)}` : ''}
                        </div>
                        <div style={{ color: '#B0B3B8', fontSize: 13, marginTop: 2 }}>
                          {vipExpiresAt
                            ? `Your Access Runs Until ${new Date(vipExpiresAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}. Anything You Buy Below Is Added To The End Of That, Never Instead Of It.`
                            : 'Anything You Buy Below Extends Your Membership Rather Than Replacing It.'}
                        </div>
                      </div>
                      <a
                        href="/hub/settings?section=billing"
                        className={shellStyles.vipManageAction}
                        style={{
                          minHeight: 44,
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '10px 16px',
                          border: '1px solid rgba(255,215,0,0.55)',
                          background: 'transparent',
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
                    className={shellStyles.vipTools}
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      flexWrap: 'wrap',
                      gap: 10,
                      marginTop: 14,
                    }}
                  >
                    <Link
                      href="/hub/vip-membership/compare"
                      className={shellStyles.vipToolLink}
                      style={{
                        display: 'inline-flex',
                        minHeight: 44,
                        alignItems: 'center',
                        padding: '9px 15px',
                        border: '1px solid #385D70',
                        color: '#8FE8FF',
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      Compare Every VIP Plan
                    </Link>
                    <Link
                      href="/hub/vip-membership/manage"
                      className={shellStyles.vipToolLink}
                      style={{
                        display: 'inline-flex',
                        minHeight: 44,
                        alignItems: 'center',
                        padding: '9px 15px',
                        border: '1px solid #385D70',
                        color: '#8FE8FF',
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
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
                      disabled={isProcessing || vipPrimaryBlocked}
                      aria-busy={isProcessing}
                      aria-label={isProcessing ? 'Processing' : vipSubscribeLabel}
                      onClick={handleVIPSubscribe}
                      style={{
                        cursor: isProcessing
                          ? 'wait'
                          : vipPrimaryBlocked
                            ? 'not-allowed'
                            : 'pointer',
                        opacity: isProcessing || vipPrimaryBlocked ? 0.6 : 1,
                        transition: 'transform 0.15s ease, filter 0.15s ease',
                        display: 'inline-block',
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        color: 'inherit',
                      }}
                    >
                      {vipCardReady ? (
                        <img
                          src="/images/subscribe-button.webp"
                          width={1249}
                          height={258}
                          alt=""
                          style={{ width: '100%', maxWidth: 420, height: 'auto', display: 'block' }}
                          draggable={false}
                          loading="lazy"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className={shellStyles.vipPrimaryFallback}
                          style={{
                            width: 'min(420px, 88vw)',
                            minHeight: 92,
                            padding: '16px 30px',
                            border: '2px solid #8CDFFF',
                            background: 'transparent',
                            boxShadow:
                              'inset 0 0 0 2px #02080D, inset 0 0 0 3px rgba(140, 223, 255, 0.5), 0 0 28px rgba(0, 180, 255, 0.32)',
                            clipPath:
                              'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)',
                            color: '#EAF8FF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 14,
                          }}
                        >
                          <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                            <strong style={{ fontSize: 18, letterSpacing: '0.04em' }}>
                              {selectedVipHasExactRecovery ? 'Verify Purchase' : 'Buy Lifetime VIP'}
                            </strong>
                            <span style={{ color: '#8CDFFF', fontSize: 14, fontWeight: 700 }}>
                              49,900 Diamonds · One Time
                            </span>
                          </span>
                        </span>
                      )}
                      {/* Card-ready terms use the monthly artwork and state the
                        selected live term below it. Lifetime renders its own
                        Diamond action so the picture and settlement agree. */}
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

                  {vipDiamondRecovery.message && (
                    <div
                      role={vipDiamondRecovery.status === 'recoverable' ? 'status' : 'alert'}
                      style={{
                        maxWidth: 620,
                        margin: '10px auto 0',
                        color: vipDiamondRecovery.status === 'recoverable' ? '#8CDFFF' : '#FFD18C',
                        fontSize: 13,
                        lineHeight: 1.5,
                        textAlign: 'center',
                      }}
                    >
                      {marketplaceCopy(vipDiamondRecovery.message)}
                    </div>
                  )}

                  {/* Card-ready terms also expose Diamonds as the alternate
                    settlement path. Lifetime's primary action is already the
                    Diamond purchase, so do not render the same action twice. */}
                  {selectedVIPPlan && vipCardReady && (
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
                        const hasExactRecovery = selectedVipHasExactRecovery;
                        const canOpenDiamondReview =
                          !vipRecoveryBlocksPurchase && (hasExactRecovery || canAfford);
                        return (
                          <>
                            <button
                              type="button"
                              className={shellStyles.vipDiamondAction}
                              disabled={isProcessing || !canOpenDiamondReview}
                              onClick={() => {
                                openVipDiamondReview(selectedVIPPlan, {
                                  freshAllowed: canAfford,
                                  freshBlockedMessage:
                                    vipTier === 'lifetime'
                                      ? 'Lifetime VIP Already Includes This Membership.'
                                      : 'Your Verified Diamond Balance Cannot Fund This Purchase.',
                                });
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '11px 22px',
                                borderRadius: 12,
                                background: canOpenDiamondReview
                                  ? 'rgba(0,180,255,0.12)'
                                  : 'rgba(255,255,255,0.04)',
                                border: `1px solid ${canOpenDiamondReview ? 'rgba(0,180,255,0.4)' : 'rgba(255,255,255,0.12)'}`,
                                color: canOpenDiamondReview ? '#00D4FF' : 'rgba(255,255,255,0.4)',
                                fontSize: 15,
                                fontWeight: 600,
                                cursor:
                                  isProcessing || !canOpenDiamondReview ? 'not-allowed' : 'pointer',
                              }}
                            >
                              {hasExactRecovery
                                ? 'Verify Purchase'
                                : `Pay With Diamonds Instead: ${Number(cost).toLocaleString()}`}
                            </button>
                            <div style={{ fontSize: 12, color: '#B0B3B8', marginTop: 8 }}>
                              {hasExactRecovery
                                ? 'This Reuses The Protected Request For These Exact VIP Terms.'
                                : !known
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
                          {marketplaceCopy(pendingSpend.title)}
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
                          {marketplaceCopy(pendingSpend.detail)}
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
                          {Number(pendingSpend.cost).toLocaleString()} Diamonds
                        </div>
                        <div className={shellStyles.dialogActions}>
                          <button
                            type="button"
                            className={shellStyles.dialogSecondaryAction}
                            disabled={isProcessing}
                            onClick={() => setPendingSpend(null)}
                            style={{
                              ...styles.paintedSecondaryAction,
                              flex: 1,
                              padding: '11px 0',
                              fontSize: 15,
                              fontWeight: 600,
                              cursor: isProcessing ? 'not-allowed' : 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={shellStyles.dialogPrimaryAction}
                            disabled={isProcessing}
                            onClick={async () => {
                              // One kind of spend since the Daily Pass was
                              // retired: a plan bought with diamonds.
                              const spend = pendingSpend;
                              const applied = await runDiamondPlanPurchase(
                                spend.planKey,
                                spend.idempotencyKey,
                                spend.commerceIntent,
                                spend.purchaseWasResumed
                              );
                              // Keep the same operation identity through an
                              // ambiguous response or retryable failure.
                              if (applied) setPendingSpend(null);
                            }}
                            style={{
                              ...styles.paintedPrimaryAction,
                              flex: 1,
                              padding: '11px 0',
                              fontSize: 15,
                              fontWeight: 700,
                              cursor: isProcessing ? 'wait' : 'pointer',
                            }}
                          >
                            {isProcessing
                              ? pendingSpend.purchaseWasResumed
                                ? 'Verifying...'
                                : 'Processing...'
                              : pendingSpend.purchaseWasResumed
                                ? 'Verify Purchase'
                                : 'Confirm'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VIP Benefits Table */}
                  <div className={shellStyles.vipBenefits} style={styles.benefitsSection}>
                    <h2 style={styles.benefitsTitle}>
                      Everything Included With {lifetimeSelected ? 'Lifetime VIP' : 'VIP'}
                    </h2>

                    {/* Smarter.Poker Platform */}
                    <div style={styles.benefitsCategoryHeader}>
                      <span style={styles.benefitsCategoryLabel}>Smarter.Poker Platform</span>
                    </div>
                    <div className={shellStyles.responsiveGrid} style={styles.benefitsGrid}>
                      {displayedVipBenefits
                        .filter((b) => b.category === 'Smarter.Poker')
                        .map((benefit, idx) => (
                          <div
                            key={idx}
                            className={shellStyles.premiumDataCard}
                            style={styles.benefitCard}
                          >
                            <div style={styles.benefitInfo}>
                              <div style={styles.benefitTitle}>
                                {marketplaceCopy(benefit.title)}
                              </div>
                              <div style={styles.benefitDesc}>
                                {marketplaceCopy(benefit.description)}
                              </div>
                            </div>
                            <div style={styles.benefitValue}>{marketplaceCopy(benefit.value)}</div>
                          </div>
                        ))}
                    </div>
                    {/* Club & Diamond Arena Features */}
                    <div style={styles.benefitsCategoryHeader}>
                      <span style={styles.benefitsCategoryLabel}>
                        Club & Diamond Arena Features
                      </span>
                    </div>
                    <div className={shellStyles.responsiveGrid} style={styles.benefitsGrid}>
                      {displayedVipBenefits
                        .filter((b) => b.category === 'Club & Diamond Arena')
                        .map((benefit, idx) => (
                          <div
                            key={idx}
                            className={shellStyles.premiumDataCard}
                            style={styles.benefitCard}
                          >
                            <div style={styles.benefitInfo}>
                              <div style={styles.benefitTitle}>
                                {marketplaceCopy(benefit.title)}
                              </div>
                              <div style={styles.benefitDesc}>
                                {marketplaceCopy(benefit.description)}
                              </div>
                            </div>
                            <div style={styles.benefitValue}>{marketplaceCopy(benefit.value)}</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* View in Marketplace Link */}
                  <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 32 }}>
                    <a
                      href={TAB_ROUTES.merch}
                      className={shellStyles.vipMarketplaceLink}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 16,
                        fontWeight: 600,
                        textDecoration: 'none',
                        cursor: 'pointer',
                        padding: '12px 24px',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      View In Marketplace
                    </a>
                  </div>

                  {/* ─── Frequently Asked Questions ─── */}
                  <div className={shellStyles.vipFaq}>
                    <h2>Frequently Asked Questions</h2>

                    {VIP_FAQ.map((faq, idx) => (
                      <details key={idx}>
                        <summary>{faq.q}</summary>
                        <p>{faq.a}</p>
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
                    className={shellStyles.rewardsBoostLayout}
                    style={{
                      ...styles.rewardStatusFrame,
                      margin: '12px 0 0',
                      padding: '14px 16px',
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
                        <span className={shellStyles.rewardsBoostMarker} aria-hidden="true">
                          {diamondMultiplier > 1.0 ? 'Boost' : 'Earn'}
                        </span>
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
                              ...styles.rewardMultiplierPlate,
                              ...(tier.label === 'Legend 30d'
                                ? styles.rewardMultiplierPlateGold
                                : {}),
                              color: tier.color,
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
                          <h3 style={styles.overviewCardTitle}>Diamond Rewards</h3>
                          <p style={styles.overviewCardText}>
                            Earn Diamonds Through Daily Logins, Training, Social Engagement, And
                            Referrals.
                            <strong style={{ color: '#00d4ff' }}>
                              {' '}
                              Daily Cap: {DAILY_CAP.free} Diamonds ({DAILY_CAP.vip} VIP)
                            </strong>{' '}
                            With Up To {fmt(MONTHLY_CAP.free)} Diamonds A Month Free,{' '}
                            {fmt(MONTHLY_CAP.vip)} Diamonds VIP. Share Streak Multipliers Help You
                            Reach The Cap Faster: They Never Raise It.
                          </p>
                        </div>

                        <div className={shellStyles.casinoDataCard} style={styles.overviewCard}>
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
                          <div style={styles.vipPriceDeck}>
                            <div
                              style={{
                                ...styles.vipPricePlate,
                                ...styles.vipPricePlateGold,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 800,
                                  color: '#FFD700',
                                  fontFamily:
                                    "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
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
                            <div style={styles.vipPricePlate}>
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 800,
                                  color: '#00D4FF',
                                  fontFamily:
                                    "var(--font-roboto-condensed), 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif",
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
                            style={styles.vipPlanAction}
                          >
                            View VIP Plans
                          </a>
                        </div>

                        <div className={shellStyles.casinoDataCard} style={styles.overviewCard}>
                          <h3 style={styles.overviewCardTitle}>Easter Eggs</h3>
                          <p style={styles.overviewCardText}>
                            Discover <strong>{TOTAL_EASTER_EGGS} Hidden Achievements</strong> Across{' '}
                            {EGG_CATEGORY_COUNT} Categories. From Performance To Legacy Milestones:
                            Eggs Pay Up To {EASTER_EGG_MONTHLY_CAP} Diamonds A Month On Top Of Your
                            Normal Cap. {EARNABLE_EGG_COUNT} Are Live Now.
                          </p>
                        </div>
                      </div>

                      <div className={shellStyles.rewardsQuickStats} style={styles.quickStats}>
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
                        The Cap Is Measured After Your Share Streak Multiplier: Multipliers Help You
                        Reach {DAILY_CAP.free} Diamonds A Day With Less Work, They Never Raise It.
                        Easter Eggs Draw On A Separate {EASTER_EGG_MONTHLY_CAP} Diamonds Per Month
                        Budget On Top. 1 Diamond = $0.01, So {fmt(MONTHLY_CAP.free)} Diamonds A
                        Month = ${(MONTHLY_CAP.free / 100).toFixed(0)}.
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
                              <div style={styles.rewardDetails}>
                                <span style={styles.rewardName}>
                                  <RewardDetailLink reward={reward}>
                                    {marketplaceCopy(reward.name)}
                                  </RewardDetailLink>
                                </span>
                                <span style={styles.rewardNote}>
                                  {marketplaceCopy(reward.note)}
                                </span>
                              </div>
                              <span style={styles.rewardAmount}>
                                {marketplaceCopy(reward.amount)}
                              </span>
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
                        Tracking Expands. Eggs Pay Up To {EASTER_EGG_MONTHLY_CAP} Diamonds A Month
                        On Top Of Your Normal Daily Cap, And The Biggest Single Egg Pays{' '}
                        {biggestEggValue()} Diamonds.
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                              <h4 style={styles.eggName}>
                                <RewardDetailLink reward={egg}>
                                  {marketplaceCopy(egg.name)}
                                </RewardDetailLink>
                              </h4>
                              <div
                                style={{
                                  ...styles.rarityBadge,
                                  ...styles[
                                    `rarity${egg.rarity.charAt(0).toUpperCase() + egg.rarity.slice(1)}`
                                  ],
                                }}
                              >
                                {marketplaceCopy(egg.rarity)}
                              </div>
                              <div style={styles.eggReward}>{marketplaceCopy(egg.reward)}</div>
                              <p style={styles.eggTrigger}>{marketplaceCopy(egg.trigger)}</p>
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
                    <div role="status" aria-live="polite" style={styles.clubSuccessStatus}>
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
                          {clubShopBuyTarget.purchaseWasResumed
                            ? 'Verify Purchase'
                            : 'Confirm Purchase'}
                        </h3>
                        <div className={shellStyles.dialogProductRow}>
                          <div className={shellStyles.dialogProductMedia}>
                            {clubShopBuyArt?.kind === 'image' ? (
                              <img
                                src={clubShopBuyArt.source}
                                alt={marketplaceCopy(clubShopBuyTarget.name)}
                                className={shellStyles.dialogProductImage}
                              />
                            ) : clubShopBuyArt?.kind === 'atlas' ? (
                              <div
                                role="img"
                                aria-label={marketplaceCopy(clubShopBuyTarget.name)}
                                className={shellStyles.dialogProductAtlas}
                                style={{ backgroundPosition: clubShopBuyArt?.position }}
                              />
                            ) : (
                              <div role="status" className={shellStyles.dialogProductUnavailable}>
                                Reviewed Product Art Unavailable
                              </div>
                            )}
                          </div>
                          <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#E4E6EB' }}>
                              {marketplaceCopy(clubShopBuyTarget.name)}
                            </div>
                            <div
                              id="club-shop-dialog-description"
                              style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}
                            >
                              {marketplaceCopy(clubShopBuyTarget.description || '')}
                            </div>
                          </div>
                        </div>
                        <div className={shellStyles.dialogPriceGrid}>
                          <div
                            className={shellStyles.dialogMetric}
                            style={{
                              flex: 1,
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'capitalize',
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
                            className={shellStyles.dialogMetric}
                            style={{
                              flex: 1,
                              padding: '12px 16px',
                              textAlign: 'center',
                            }}
                          >
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: 'rgba(255,255,255,0.4)',
                                textTransform: 'capitalize',
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
                              {visibleClubDiamondBalance.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        {clubShopBuyTarget.purchaseWasResumed && (
                          <div
                            role="status"
                            style={{
                              color: '#8CDFFF',
                              fontSize: 13,
                              fontWeight: 600,
                              marginBottom: 12,
                              textAlign: 'center',
                            }}
                          >
                            This Reuses The Original Protected Request. The Server Will Verify Its
                            Authoritative Result Even If Balance Or Availability Changed.
                          </div>
                        )}
                        {!clubShopBuyTarget.purchaseWasResumed &&
                          clubShopBuyTarget.price > 0 &&
                          visibleClubDiamondBalance < clubShopBuyTarget.price && (
                            <div
                              style={{
                                color: '#ff6b6b',
                                fontSize: 13,
                                fontWeight: 600,
                                marginBottom: 12,
                                textAlign: 'center',
                              }}
                            >
                              Insufficient Diamonds. You Need{' '}
                              {(
                                clubShopBuyTarget.price - visibleClubDiamondBalance
                              ).toLocaleString()}{' '}
                              More.
                            </div>
                          )}
                        <div className={shellStyles.dialogActions}>
                          <button
                            className={shellStyles.dialogSecondaryAction}
                            onClick={() => setClubShopBuyTarget(null)}
                            disabled={clubShopProcessing}
                            style={{
                              flex: 1,
                              padding: '12px',
                              fontSize: 14,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className={shellStyles.dialogPrimaryAction}
                            onClick={handleClubPurchase}
                            disabled={
                              clubShopProcessing ||
                              (!clubShopBuyTarget.purchaseWasResumed &&
                                clubShopBuyTarget.price > 0 &&
                                visibleClubDiamondBalance < clubShopBuyTarget.price)
                            }
                            style={{
                              flex: 1,
                              padding: '12px',
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: clubShopProcessing ? 'wait' : 'pointer',
                            }}
                          >
                            {clubShopProcessing
                              ? clubShopBuyTarget.purchaseWasResumed
                                ? 'Verifying...'
                                : 'Purchasing...'
                              : clubShopBuyTarget.purchaseWasResumed
                                ? 'Verify Purchase'
                                : 'Confirm Purchase'}
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
                      Club Shop
                      <span style={styles.clubBalanceStatus}>
                        {visibleClubDiamondBalance.toLocaleString()} Diamonds
                      </span>
                    </h2>
                    <p style={styles.introText}>
                      Purchase Verified In-Game Access For Your Club With Diamonds: Time Banks And
                      The Platform All Throwables Pack.
                    </p>
                  </div>

                  {clubShopAuthPending ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}
                    >
                      <ClubShopLoadingText />
                    </div>
                  ) : !committedStoreAccountId ? (
                    <div style={{ textAlign: 'center', padding: 40 }}>
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
                        color: '#FF5B6E',
                        textAlign: 'center',
                      }}
                    >
                      <div>{marketplaceCopy(clubShopError)}</div>
                      <button
                        type="button"
                        onClick={() => loadClubShop(false)}
                        disabled={clubShopLoading}
                        style={{
                          ...styles.paintedSecondaryAction,
                          minHeight: 44,
                          padding: '10px 22px',
                          fontWeight: 700,
                          cursor: clubShopLoading ? 'wait' : 'pointer',
                        }}
                      >
                        {clubShopLoading ? 'Retrying...' : 'Retry Club Shop'}
                      </button>
                    </div>
                  ) : clubShopLoading && !clubShopSnapshotOwned ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}
                    >
                      <ClubShopLoadingText />
                    </div>
                  ) : !clubShopClubId ? (
                    clubShopLoaded ? (
                      <div style={{ textAlign: 'center', padding: 40 }}>
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
                        <ClubShopLoadingText />
                      </div>
                    )
                  ) : !clubShopSnapshotOwned ? (
                    <div
                      role="status"
                      aria-live="polite"
                      style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.5)' }}
                    >
                      <ClubShopLoadingText />
                    </div>
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
                            label: `Store (${visibleClubShopItems.length})`,
                          },
                          {
                            key: 'my-purchases',
                            label: `My Purchases (${visibleClubShopPurchases.length})`,
                          },
                          ...(clubShopIsAdmin ? [{ key: 'manage', label: 'Manage' }] : []),
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
                            {st.label}
                          </button>
                        ))}
                      </div>

                      {clubShopSubTab === 'store' && (
                        <>
                          {(clubUnavailableRecoveryItems.length > 0 ||
                            clubUnavailableRecoveryError) && (
                            <section
                              className={shellStyles.clubRecoveryNotice}
                              role={clubUnavailableRecoveryError ? 'alert' : 'status'}
                              aria-live="polite"
                            >
                              <strong>
                                {clubUnavailableRecoveryError
                                  ? 'Protected Purchase Review Unavailable'
                                  : 'Protected Purchases Need Review'}
                              </strong>
                              <span>
                                {clubUnavailableRecoveryError
                                  ? marketplaceCopy(clubUnavailableRecoveryError)
                                  : 'A Previous Purchase Is Still Protected, But Its Item Is No Longer In The Current Club Catalog. Do Not Start A Replacement While The Original Purchase Remains Locked For Verification.'}
                              </span>
                              {!clubUnavailableRecoveryError && (
                                <div className={shellStyles.clubRecoverySlots}>
                                  {clubUnavailableRecoveryItems.map((recovery, index) => (
                                    <span
                                      key={recovery.itemId}
                                      className={shellStyles.clubRecoverySlot}
                                    >
                                      Protected Purchase {index + 1}: Awaiting Original Catalog
                                      Terms
                                    </span>
                                  ))}
                                </div>
                              )}
                            </section>
                          )}
                          {/* Category Filters */}
                          <div
                            role="group"
                            aria-label="Club Shop Categories"
                            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}
                          >
                            {['All', 'Time Banks', 'Throwables'].map((cat) => (
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
                              data-preserve-case="true"
                              data-user-content="true"
                              type="text"
                              aria-label="Search Club Shop Items"
                              placeholder="Search Items..."
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
                              <option value="price-low">Price: Low To High</option>
                              <option value="price-high">Price: High To Low</option>
                              <option value="popular">Most Popular</option>
                            </select>
                          </div>

                          {/* Item Grid */}
                          {(() => {
                            let filtered = [...visibleClubShopItems];
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
                                  <div
                                    style={{
                                      fontSize: 14,
                                      color: 'rgba(255,255,255,0.5)',
                                      fontWeight: 600,
                                    }}
                                  >
                                    {visibleClubShopItems.length === 0
                                      ? 'The Shop Is Currently Empty.'
                                      : 'No Items Match Your Filter.'}
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
                                  const productArt = resolveClubShopProductArt(item);
                                  const blocked = item.available !== true;
                                  const blockedLabel = blocked
                                    ? item.availability_reason === 'sold_out'
                                      ? 'Sold Out'
                                      : item.availability_reason === 'not_yet_available'
                                        ? 'Not Yet Available'
                                        : item.availability_reason === 'no_longer_available'
                                          ? 'Offer Ended'
                                          : item.availability_reason === 'limit_reached'
                                            ? 'Limit Reached'
                                            : item.availability_reason === 'already_owned'
                                              ? 'Owned'
                                              : 'Unavailable'
                                    : 'Available';
                                  const diamondProjection = getClubDiamondPurchaseProjection(
                                    item.price,
                                    visibleClubDiamondBalance
                                  );
                                  const cardQuote = normalizeClubCardQuote(item.card_quote);
                                  const cardCharge = cardQuote?.cardCharge ?? null;
                                  const diamondPurchaseBalance =
                                    diamondProjection?.remainingBalance ?? null;
                                  const diamondShortfall = diamondProjection?.shortfall ?? null;
                                  const hasDiamondDebt = diamondProjection?.hasDebt === true;
                                  const cardPurchaseBalance =
                                    cardQuote?.cardPurchaseBalance ?? null;
                                  const isFreeItem =
                                    item.available === true && Number(item.price) === 0;
                                  const canPurchaseWithDiamonds =
                                    !blocked &&
                                    (isFreeItem ||
                                      (diamondProjection &&
                                        !diamondProjection.hasDebt &&
                                        diamondProjection.shortfall === 0));
                                  const diamondRecovery =
                                    clubDiamondRecoveryByItem[item.id] || EMPTY_COMMERCE_RECOVERY;
                                  const hasExactDiamondRecovery =
                                    diamondRecovery.status === 'recoverable';
                                  const canOpenDiamondReview =
                                    !['terms-changed', 'terms-unavailable', 'unavailable'].includes(
                                      diamondRecovery.status
                                    ) &&
                                    (hasExactDiamondRecovery || canPurchaseWithDiamonds);
                                  return (
                                    <article key={item.id} className={shellStyles.clubItemCard}>
                                      <div className={shellStyles.clubProductMedia}>
                                        {productArt.kind === 'image' ? (
                                          <img
                                            src={productArt.source}
                                            alt={marketplaceCopy(item.name)}
                                            loading="lazy"
                                            decoding="async"
                                            className={shellStyles.clubProductCutout}
                                          />
                                        ) : productArt.kind === 'atlas' ? (
                                          <div
                                            role="img"
                                            aria-label={marketplaceCopy(item.name)}
                                            className={shellStyles.clubProductAtlas}
                                            style={{
                                              backgroundPosition: productArt.position,
                                            }}
                                          />
                                        ) : (
                                          <div
                                            role="status"
                                            className={shellStyles.clubProductUnavailable}
                                          >
                                            Reviewed Product Art Unavailable
                                          </div>
                                        )}
                                        <span className={shellStyles.clubItemCategory}>
                                          {marketplaceCopy(item.category || 'Time Banks')}
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
                                          {marketplaceCopy(item.name)}
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
                                          {marketplaceCopy(item.description || 'No Description.')}
                                        </div>
                                        <Link
                                          href={`/hub/club-shop/${encodeURIComponent(item.id)}?clubId=${encodeURIComponent(clubShopClubId)}`}
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
                                              {item.price.toLocaleString()} Diamonds
                                            </span>
                                            {item.on_sale && (
                                              <span
                                                style={{
                                                  display: 'block',
                                                  color: '#AABAC2',
                                                  fontSize: 10,
                                                  textDecoration: 'line-through',
                                                }}
                                              >
                                                Regular{' '}
                                                {Number(item.list_price || 0).toLocaleString()}{' '}
                                                Diamonds
                                              </span>
                                            )}
                                            <div className={shellStyles.cardEquivalent}>
                                              {hasDiamondDebt
                                                ? 'Resolve Diamond Balance Before Card Checkout'
                                                : cardCharge == null
                                                  ? 'Card Limit Exceeded'
                                                  : diamondShortfall > 0
                                                    ? `Need ${diamondShortfall.toLocaleString()} More Diamonds · Card $${cardCharge.toFixed(2)} Leaves ${cardPurchaseBalance.toLocaleString()}`
                                                    : `Diamonds Leave ${diamondPurchaseBalance.toLocaleString()} · Card $${cardCharge.toFixed(2)} Leaves ${cardPurchaseBalance.toLocaleString()}`}
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
                                              onClick={() => openClubPurchaseReview(item)}
                                              disabled={
                                                !canOpenDiamondReview ||
                                                clubShopCardProcessingId === item.id
                                              }
                                            >
                                              {hasExactDiamondRecovery
                                                ? 'Verify Purchase'
                                                : blocked
                                                  ? blockedLabel
                                                  : isFreeItem
                                                    ? 'Claim Free'
                                                    : canPurchaseWithDiamonds
                                                      ? 'Buy With Diamonds'
                                                      : 'More Diamonds Needed'}
                                            </button>
                                            {!blocked && (
                                              <button
                                                type="button"
                                                onClick={() => handleClubCardCheckout(item)}
                                                disabled={
                                                  Boolean(clubShopCardProcessingId) || !cardQuote
                                                }
                                              >
                                                {clubShopCardProcessingId === item.id
                                                  ? 'Opening...'
                                                  : cardCharge == null
                                                    ? isFreeItem
                                                      ? 'No Card Charge'
                                                      : hasDiamondDebt
                                                        ? 'Card Checkout Paused'
                                                        : 'Card Unavailable'
                                                    : `Card $${cardCharge.toFixed(2)}`}
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                        {diamondRecovery.message && (
                                          <div
                                            role={hasExactDiamondRecovery ? 'status' : 'alert'}
                                            style={{
                                              marginTop: 10,
                                              color: hasExactDiamondRecovery
                                                ? '#8CDFFF'
                                                : '#FFD18C',
                                              fontSize: 11,
                                              lineHeight: 1.45,
                                            }}
                                          >
                                            {marketplaceCopy(diamondRecovery.message)}
                                          </div>
                                        )}
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
                          {visibleClubShopPurchases.length === 0 ? (
                            <div style={styles.clubEmptyState}>
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
                                  ...styles.paintedPrimaryAction,
                                  marginTop: 12,
                                  padding: '10px 24px',
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
                              style={styles.clubLedgerViewport}
                            >
                              <table style={styles.clubLedgerTable}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <th
                                      style={{
                                        padding: '12px 16px',
                                        textAlign: 'left',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.65)',
                                        textTransform: 'capitalize',
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
                                        textTransform: 'capitalize',
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
                                        textTransform: 'capitalize',
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
                                        textTransform: 'capitalize',
                                      }}
                                    >
                                      Date
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {visibleClubShopPurchases.map((p) => {
                                    const itemData = visibleClubShopItems.find(
                                      (i) => i.id === p.item_id
                                    );
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
                                          {marketplaceCopy(name)}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                          <span style={styles.clubCategoryPlate}>
                                            {marketplaceCopy(cat)}
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
                                                color: '#FF5B6E',
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
                                border: '1px solid rgba(240,40,73,0.55)',
                                background: 'rgba(240,40,73,0.10)',
                                color: '#FF5B6E',
                              }}
                            >
                              <span>{marketplaceCopy(clubShopAdminError)}</span>
                              <button
                                type="button"
                                onClick={loadClubShopAdmin}
                                disabled={clubShopAdminLoading}
                                style={{
                                  ...styles.paintedSecondaryAction,
                                  minHeight: 44,
                                  padding: '8px 16px',
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
                          {clubShopAdminReport &&
                            !clubShopAdminError &&
                            (() => {
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
                                      {
                                        label: 'Net Diamond Sales',
                                        val: fmt(diamondTotals.netSales),
                                      },
                                      { label: 'Diamonds Burned', val: fmt(diamondTotals.net) },
                                      {
                                        label: 'Diamond Refunds',
                                        val: fmt(diamondTotals.refunded),
                                      },
                                    ].map((stat) => (
                                      <div
                                        key={stat.label}
                                        className={shellStyles.clubAdminStat}
                                        style={{
                                          background: 'rgba(255,255,255,0.05)',
                                          border: '1px solid rgba(255,255,255,0.08)',
                                          borderRadius: 12,
                                          padding: '16px 14px',
                                          textAlign: 'center',
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: 22,
                                            fontWeight: 800,
                                            color: '#00D4FF',
                                          }}
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
                                    className={shellStyles.clubAdminOwnershipNotice}
                                    style={{
                                      marginBottom: 24,
                                      padding: '10px 12px',
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
                                        Legacy History: {fmt(legacyChipTotals.netSales)} Net Chip
                                        Sales / {fmt(legacyChipTotals.net)} Chips. These Are Kept
                                        Separate From Diamond Totals.
                                      </span>
                                    )}
                                  </div>
                                </>
                              );
                            })()}

                          {/* Create Item Form */}
                          <div
                            className={shellStyles.clubAdminCreatePanel}
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
                              Create Shop Item
                            </h3>
                            <div
                              className={shellStyles.controlRow}
                              style={{ display: 'flex', gap: 10, marginBottom: 10 }}
                            >
                              <input
                                data-preserve-case="true"
                                data-user-content="true"
                                aria-label="Item Name"
                                value={clubShopNewName}
                                onChange={(e) => setClubShopNewName(e.target.value)}
                                placeholder="Item Name"
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
                                max={clubShopMaximumCardFundedPrice || undefined}
                                step="1"
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
                            <div
                              role="status"
                              style={{
                                color: clubShopMaximumCardFundedPrice
                                  ? 'rgba(255,255,255,0.62)'
                                  : '#FF5B6E',
                                fontSize: 12,
                                margin: '-2px 0 10px',
                              }}
                            >
                              {clubShopMaximumCardFundedPrice
                                ? `Current Card-Compatible Price Limit: ${clubShopMaximumCardFundedPrice.toLocaleString()} Diamonds.`
                                : 'Current Card Price Limit Is Unavailable. Item Creation Is Paused.'}
                            </div>
                            <input
                              data-preserve-case="true"
                              data-user-content="true"
                              aria-label="Item Description"
                              value={clubShopNewDesc}
                              onChange={(e) => setClubShopNewDesc(e.target.value)}
                              placeholder="Description (Optional)"
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
                                {CLUB_ADMIN_CREATABLE_CATEGORIES.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                              <input
                                type="number"
                                aria-label="Time Bank Uses Delivered"
                                value={clubShopNewGrantQty}
                                onChange={(e) => setClubShopNewGrantQty(e.target.value)}
                                placeholder="Uses Delivered"
                                min="1"
                                max="1000"
                                step="1"
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
                              <input
                                data-preserve-case="true"
                                data-user-content="true"
                                aria-label="Item Image URL"
                                value={clubShopNewImage}
                                onChange={(e) => setClubShopNewImage(e.target.value)}
                                placeholder="Image URL (Optional)"
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
                                clubShopProcessing ||
                                !clubShopNewName.trim() ||
                                !clubShopNewPrice ||
                                !Number.isSafeInteger(Number(clubShopNewGrantQty)) ||
                                Number(clubShopNewGrantQty) < 1 ||
                                Number(clubShopNewGrantQty) > 1000 ||
                                !clubShopMaximumCardFundedPrice
                              }
                              onClick={async () => {
                                if (clubShopProcessingRef.current) return;
                                const expectedAccountId = committedStoreAccountId;
                                const expectedClubId = clubShopClubId;
                                if (
                                  !clubShopSnapshotOwned ||
                                  !clubShopIsAdmin ||
                                  !expectedAccountId ||
                                  !expectedClubId ||
                                  (routeClubId && expectedClubId !== routeClubId) ||
                                  clubShopPurchaseOwnerRef.current.accountId !==
                                    expectedAccountId ||
                                  clubShopPurchaseOwnerRef.current.clubId !== expectedClubId ||
                                  getAuthUser()?.id !== expectedAccountId
                                ) {
                                  showStoreToast(
                                    'error',
                                    'The Club Shop Changed. Reload The Current Club Before Managing.'
                                  );
                                  return;
                                }
                                if (clubShopNewCategory === 'Throwables') {
                                  setClubShopNewCategory('Time Banks');
                                  showStoreToast(
                                    'warning',
                                    'The All Throwables Pack Is Platform Managed And Cannot Be Split.'
                                  );
                                  return;
                                }
                                const now = Date.now();
                                if (now - clubShopLastCreate < 3000) {
                                  showStoreToast(
                                    'warning',
                                    'Please Wait Before Creating Another Item'
                                  );
                                  return;
                                }
                                const price = Number(clubShopNewPrice);
                                const grantQty = Number(clubShopNewGrantQty);
                                if (!Number.isSafeInteger(price) || price <= 0) {
                                  showStoreToast('error', 'Price Must Be A Positive Whole Number.');
                                  return;
                                }
                                if (
                                  !Number.isSafeInteger(grantQty) ||
                                  grantQty < 1 ||
                                  grantQty > 1000
                                ) {
                                  showStoreToast(
                                    'error',
                                    'Time Bank Uses Must Be A Whole Number From 1 Through 1,000.'
                                  );
                                  return;
                                }
                                if (!clubShopMaximumCardFundedPrice) {
                                  showStoreToast(
                                    'error',
                                    'Current Card Price Limit Is Unavailable. Please Retry.'
                                  );
                                  return;
                                }
                                if (price > clubShopMaximumCardFundedPrice) {
                                  showStoreToast(
                                    'error',
                                    `Price Cannot Exceed ${clubShopMaximumCardFundedPrice.toLocaleString()} Diamonds.`
                                  );
                                  return;
                                }
                                setClubProcessing(true);
                                try {
                                  // Server-side admin CRUD (post-Phase-37 RLS lockdown: anon
                                  // writes to club_shop_items now blocked by design).
                                  const token = getAccessToken();
                                  if (!token) throw new Error('Not Authenticated');
                                  const resp = await fetch('/api/club-arena/shop-items', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      action: 'create',
                                      clubId: expectedClubId,
                                      name: clubShopNewName.trim(),
                                      price,
                                      description: clubShopNewDesc.trim() || null,
                                      category: clubShopNewCategory,
                                      grantType: 'time_bank',
                                      grantQty,
                                      stackable: true,
                                      imageUrl: clubShopNewImage.trim() || null,
                                    }),
                                  });
                                  const json = await resp.json().catch(() => ({}));
                                  if (
                                    clubShopPurchaseOwnerRef.current.accountId !==
                                      expectedAccountId ||
                                    clubShopPurchaseOwnerRef.current.clubId !== expectedClubId ||
                                    getAuthUser()?.id !== expectedAccountId
                                  ) {
                                    return;
                                  }
                                  if (!resp.ok || !json.success)
                                    throw new Error(json.error || `HTTP ${resp.status}`);
                                  setClubShopLastCreate(Date.now());
                                  setClubShopNewName('');
                                  setClubShopNewPrice('');
                                  setClubShopNewDesc('');
                                  setClubShopNewImage('');
                                  setClubShopNewCategory('Time Banks');
                                  setClubShopNewGrantQty('1');
                                  clubShopLoadingRef.current = false;
                                  await Promise.all([loadClubShopAdmin(), loadClubShop(true)]);
                                } catch (err) {
                                  showStoreToast('error', marketplaceCopy(err.message));
                                } finally {
                                  setClubProcessing(false);
                                }
                              }}
                              className={shellStyles.clubAdminCreateAction}
                            >
                              {clubShopProcessing ? 'Creating...' : 'Create Item'}
                            </button>
                          </div>

                          {/* Admin Item List */}
                          {clubShopAdminReport &&
                            !clubShopAdminError &&
                            (clubShopAdminItems.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: 40 }}>
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
                                    className={shellStyles.clubAdminRow}
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
                                        {item.price.toLocaleString()} Diamonds,{' '}
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
                                        , {item.net_purchase_count || 0} Net Sold,{' '}
                                        {fmt(item.revenue)} Diamonds Burned
                                        {(item.refunded_purchase_count || 0) > 0 && (
                                          <span style={{ color: '#ff6b6b' }}>
                                            , {item.refunded_purchase_count} Refunded
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    {isThrowableAdminItem(item) ? (
                                      <span className={shellStyles.clubAdminManagedStatus}>
                                        {isCanonicalAllThrowablesAdminItem(item)
                                          ? 'Platform Managed'
                                          : 'Historical Receipt Row'}
                                      </span>
                                    ) : (
                                      <div className={shellStyles.clubAdminActions}>
                                        <button
                                          type="button"
                                          onClick={() => handleClubShopAdminAction('toggle', item)}
                                          disabled={!!clubShopAdminActionId}
                                          aria-busy={clubShopAdminActionId === item.id}
                                          aria-label={`${item.is_active ? 'Hide' : 'Activate'} ${marketplaceCopy(item.name)}`}
                                        >
                                          {item.is_active ? 'Active' : 'Hidden'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setClubShopDeleteTarget(item)}
                                          disabled={!!clubShopAdminActionId}
                                          aria-haspopup="dialog"
                                          aria-expanded={clubShopDeleteTarget?.id === item.id}
                                          aria-label={`Delete ${marketplaceCopy(item.name)}`}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
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
                                  style={{ margin: 0, color: '#FF5B6E', fontSize: 19 }}
                                >
                                  Remove Club Shop Item?
                                </h4>
                                <p
                                  id="club-shop-delete-description"
                                  style={{ margin: '12px 0 0', color: '#C8D5DD', lineHeight: 1.65 }}
                                >
                                  Remove “{marketplaceCopy(clubShopDeleteTarget.name)}” From This
                                  Club’s Inventory? Items With Purchase History Cannot Be Deleted;
                                  Hide Them Instead To Preserve The Audit Trail.
                                </p>
                                <div
                                  className={shellStyles.dialogActions}
                                  style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                                    marginTop: 22,
                                  }}
                                >
                                  <button
                                    type="button"
                                    className={shellStyles.dialogSecondaryAction}
                                    onClick={dismissClubShopDeleteDialog}
                                    disabled={!!clubShopAdminActionId}
                                    style={{
                                      ...styles.paintedSecondaryAction,
                                      minHeight: 44,
                                      fontWeight: 800,
                                    }}
                                  >
                                    Keep Item
                                  </button>
                                  <button
                                    type="button"
                                    className={shellStyles.dialogPrimaryAction}
                                    onClick={() =>
                                      handleClubShopAdminAction('delete', clubShopDeleteTarget)
                                    }
                                    disabled={!!clubShopAdminActionId}
                                    aria-busy={clubShopAdminActionId === clubShopDeleteTarget.id}
                                    style={{
                                      ...styles.paintedPrimaryAction,
                                      minHeight: 44,
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
                Diamonds Are Virtual Currency And Have No Real-World Cash Value. All Purchases Are
                Final. See our{' '}
                <a href="/terms" style={styles.link}>
                  Terms Of Service
                </a>{' '}
                For Details.
              </p>
            </div>

            {activeTab !== 'diamonds' && marketplaceCommerceFooter}
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
