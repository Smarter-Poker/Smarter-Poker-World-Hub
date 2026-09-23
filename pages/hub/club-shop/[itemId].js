import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import { getAuthUser } from '../../../src/lib/authUtils';
import {
  clearCommerceRequestId,
  clearCommerceRequestById,
  getOrCreateCommerceRequestId,
  inspectCommerceRequestRecovery,
  replaceCommerceRequestId,
} from '../../../src/lib/store/checkoutIntentStore';
import { broadcastSync } from '../../../src/lib/broadcastSync';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';
import { boundedCommerceFetch } from '../../../src/lib/store/boundedCommerceFetch';
import { resolveClubShopProductArt } from '../../../src/lib/store/clubShopProductArt';
import {
  checkoutRequestReplacementRequired,
  clubCardCheckoutOfferConfirmation,
  normalizeVerifiedCheckoutSession,
  normalizeVerifiedCheckoutStatus,
  STRIPE_CHECKOUT_SESSION_ID_RE,
} from '../../../src/lib/store/verifiedCheckoutUrl.mjs';
import { getVerifiedCheckoutAuthorization } from '../../../src/lib/store/checkoutAuthorization';
import { leaveForCheckout } from '../../../src/lib/store/leaveForCheckout.mjs';
import {
  classifyClubPurchaseRefusal,
  getClubDiamondPurchaseProjection,
  normalizeClubCardQuote,
  normalizeVerifiedClubPurchaseSuccess,
  normalizeVerifiedClubShopAccountId,
  normalizeVerifiedClubShopContext,
  normalizeVerifiedClubShopItems,
} from '../../../src/lib/store/clubCardCheckout.mjs';

const CLUB_DETAIL_LOAD_TIMEOUT_MS = 20000;
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const EMPTY_COMMERCE_RECOVERY = Object.freeze({ status: 'empty', requestId: null });
const PROTECTED_TERMS_CHANGED_MESSAGE =
  'A Protected Purchase Recovery Exists For Earlier Terms. The Current Offer Does Not Match It, So This Page Will Not Start Or Verify A Different Purchase.';
const PROTECTED_TERMS_UNAVAILABLE_MESSAGE =
  'A Protected Purchase Recovery Exists For This Item, But The Current Catalog No Longer Supplies The Exact Terms Required To Verify It. The Recovery Remains Locked And No Replacement Purchase Will Be Started.';
const CLUB_CARD_REFRESH_CODES = new Set([
  'CARD_QUOTE_CHANGED',
  'CLUB_ITEM_PRICE_CHANGED',
  'CLUB_ITEM_PRICE_CONFIRMATION_REQUIRED',
  'CLUB_CARD_QUOTE_CONFIRMATION_REQUIRED',
]);

function clubDetailDiamondIntent(item, userId, clubId, routeItemId) {
  const currentItemId = item?.id || routeItemId;
  const price = Number(item?.price);
  if (!currentItemId || !userId || !clubId || !Number.isSafeInteger(price) || price < 0) {
    return null;
  }
  return {
    scope: `club-detail-${currentItemId}`,
    userId,
    paymentMethod: 'diamonds',
    intent: { clubId, itemId: currentItemId, expectedPrice: price },
  };
}

export default function ClubShopItemDetail({ routeItemId = null }) {
  const router = useRouter();
  const { user: contextUser, initializing: authInitializing } = useAvatar();
  const routerItemId = Array.isArray(router.query.itemId)
    ? router.query.itemId[0]
    : router.query.itemId;
  const itemId = routerItemId || routeItemId;
  const requestedClubId = Array.isArray(router.query.clubId)
    ? router.query.clubId[0]
    : router.query.clubId;
  const checkoutSessionId = Array.isArray(router.query.session_id)
    ? router.query.session_id[0]
    : router.query.session_id;
  const [item, setItem] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loadedAccountId, setLoadedAccountId] = useState(null);
  const [state, setState] = useState({
    kind: 'loading',
    message: 'Loading verified club inventory…',
  });
  const [diamondReviewOpen, setDiamondReviewOpen] = useState(false);
  const [diamondPurchaseRequestId, setDiamondPurchaseRequestId] = useState(null);
  const [diamondCommerceIntent, setDiamondCommerceIntent] = useState(null);
  const [diamondReviewIsRecovery, setDiamondReviewIsRecovery] = useState(false);
  const [diamondRecovery, setDiamondRecovery] = useState(EMPTY_COMMERCE_RECOVERY);
  const loadRequestRef = useRef(0);
  const loadAbortRef = useRef(null);
  const processingRef = useRef(false);
  const purchaseOwnerRef = useRef({ accountId: null, clubId: null, itemId: null });
  const diamondPurchaseAttemptRef = useRef(0);
  const diamondPurchaseAbortRef = useRef(null);
  const cardCheckoutAttemptRef = useRef(0);
  const cardCheckoutAbortRef = useRef(null);
  const diamondReviewTriggerRef = useRef(null);
  const diamondReviewTitleRef = useRef(null);
  const canonical = itemId ? `/hub/club-shop/${encodeURIComponent(itemId)}` : '/hub/club-shop';
  const returnClubId = clubId || requestedClubId;
  const clubShopReturnHref = returnClubId
    ? `/hub/club-shop?clubId=${encodeURIComponent(returnClubId)}`
    : '/hub/club-shop';
  const committedAccountId =
    contextUser?.id || (authInitializing ? getAuthUser()?.id || null : null);
  const committedClubId =
    clubId && (!requestedClubId || requestedClubId === clubId) ? clubId : null;

  useIsomorphicLayoutEffect(() => {
    loadRequestRef.current += 1;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setLoadedAccountId(null);
    setItem(null);
    setClubId(null);
    setBalance(null);
    setState(
      committedAccountId
        ? { kind: 'loading', message: 'Loading Verified Club Inventory...' }
        : {
            kind: 'auth',
            message: 'Sign In To View Club-Specific Inventory And Purchase Controls.',
          }
    );
  }, [committedAccountId, itemId, requestedClubId]);

  useIsomorphicLayoutEffect(() => {
    purchaseOwnerRef.current = {
      accountId: committedAccountId,
      clubId: committedClubId,
      itemId,
    };
    diamondPurchaseAttemptRef.current += 1;
    const invalidatedDiamondPurchase = !!diamondPurchaseAbortRef.current;
    diamondPurchaseAbortRef.current?.abort();
    diamondPurchaseAbortRef.current = null;
    cardCheckoutAttemptRef.current += 1;
    const invalidatedCardCheckout = !!cardCheckoutAbortRef.current;
    cardCheckoutAbortRef.current?.abort();
    cardCheckoutAbortRef.current = null;
    if (invalidatedDiamondPurchase || invalidatedCardCheckout) {
      processingRef.current = false;
      setState({
        kind: 'error',
        message: 'Purchase Context Changed. Review The Current Item Again.',
      });
    }
    setDiamondReviewOpen(false);
    setDiamondPurchaseRequestId(null);
    setDiamondCommerceIntent(null);
    setDiamondReviewIsRecovery(false);
    setDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
  }, [committedAccountId, committedClubId, itemId]);

  useEffect(
    () => () => {
      diamondPurchaseAttemptRef.current += 1;
      diamondPurchaseAbortRef.current?.abort();
      diamondPurchaseAbortRef.current = null;
      cardCheckoutAttemptRef.current += 1;
      cardCheckoutAbortRef.current?.abort();
      cardCheckoutAbortRef.current = null;
    },
    []
  );

  const loadItem = useCallback(
    async ({ preserveContext = false, completionMessage = '' } = {}) => {
      const requestId = ++loadRequestRef.current;
      loadAbortRef.current?.abort();
      const loadController = new AbortController();
      loadAbortRef.current = loadController;
      const loadTimer = window.setTimeout(() => {
        if (requestId !== loadRequestRef.current) return;
        loadRequestRef.current += 1;
        loadController.abort();
        setLoadedAccountId(null);
        setState({
          kind: 'error',
          message: 'Club inventory timed out. Retry the verified inventory request.',
        });
      }, CLUB_DETAIL_LOAD_TIMEOUT_MS);
      // Disable every purchase control until this exact request is rebound to
      // the current authenticated account, including background refreshes.
      setLoadedAccountId(null);
      if (!preserveContext) {
        setItem(null);
        setClubId(null);
        setBalance(null);
        setState({ kind: 'loading', message: 'Loading verified club inventory…' });
      }
      try {
        const expectedAccountId = committedAccountId;
        if (!expectedAccountId || getAuthUser()?.id !== expectedAccountId) {
          setState({
            kind: 'auth',
            message: 'Sign in to view club-specific inventory and purchase controls.',
          });
          return;
        }
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: loadController.signal,
        });
        if (!authorization) {
          setState({ kind: 'auth', message: 'Your Signed-In Account Changed. Reload This Item.' });
          return;
        }

        const params = new URLSearchParams();
        if (requestedClubId) params.set('clubId', requestedClubId);
        params.set('itemId', itemId);
        const response = await fetch(`/api/club-arena/marketplace-items?${params.toString()}`, {
          headers: { Authorization: `Bearer ${authorization.accessToken}` },
          signal: loadController.signal,
        });
        const body = await response.json().catch(() => null);
        if (requestId !== loadRequestRef.current) return;
        if (!response.ok || !body?.success)
          throw new Error(body?.error || 'Club inventory could not be loaded.');
        const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: loadController.signal,
        });
        const verifiedAccountId = normalizeVerifiedClubShopAccountId(
          body.accountId,
          expectedAccountId
        );
        if (requestId !== loadRequestRef.current) return;
        if (!confirmedAuthorization || !verifiedAccountId) {
          throw new Error('The Club Shop Catalog Could Not Be Bound To Your Current Account.');
        }
        const verifiedBalance =
          Number.isSafeInteger(body.balance) && body.balance >= 0 ? body.balance : null;
        const verifiedItems = normalizeVerifiedClubShopItems(body.items, verifiedBalance);
        const verifiedContext = normalizeVerifiedClubShopContext(
          body.clubId ?? null,
          body.role ?? null
        );
        if (!verifiedItems || !verifiedContext || verifiedBalance === null) {
          throw new Error('The Club Shop Returned An Unverified Catalog Response.');
        }
        const targetClub = verifiedContext.clubId;
        if (!targetClub) {
          setState({
            kind: 'missing-club',
            message: 'Join a club to unlock its live equipment bay.',
          });
          return;
        }
        setClubId(targetClub);
        setBalance(verifiedBalance);
        setLoadedAccountId(verifiedAccountId);
        const match = verifiedItems.find((entry) => entry.id === itemId);
        if (!match) {
          setItem(null);
          setState({
            kind: 'missing',
            message: 'This item is no longer active in the selected club.',
          });
          return;
        }
        const listPrice = match.list_price;
        const effectivePrice = match.effective_price;
        setItem({
          ...match,
          catalog_name: match.name,
          name: marketplaceCopy(match.name),
          description: marketplaceCopy(match.description),
          category: marketplaceCopy(match.category),
          list_price: listPrice,
          price: effectivePrice,
          on_sale: match.on_sale === true || effectivePrice < listPrice,
          available: match.available === true,
          availability_reason: match.availability_reason || null,
          card_checkout_reason: match.card_checkout_reason || null,
          card_quote: match.card_quote,
        });
        setState(
          completionMessage
            ? { kind: 'complete', message: completionMessage }
            : {
                kind: 'ready',
                message:
                  router.query.canceled === 'true'
                    ? 'Card Checkout Canceled. Your Diamonds And Club Inventory Were Not Changed.'
                    : 'Verified live club inventory.',
              }
        );
      } catch (error) {
        if (requestId !== loadRequestRef.current) return;
        setLoadedAccountId(null);
        setState({
          kind: 'error',
          message: error?.message || 'Club inventory could not be loaded.',
        });
      } finally {
        window.clearTimeout(loadTimer);
        if (loadAbortRef.current === loadController) loadAbortRef.current = null;
      }
    },
    [committedAccountId, itemId, requestedClubId, router.query.canceled]
  );

  useEffect(() => {
    if (!router.isReady || !itemId) return;
    void loadItem();
    return () => {
      loadRequestRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [committedAccountId, itemId, loadItem, router.isReady]);

  useEffect(() => {
    if (diamondReviewOpen) diamondReviewTitleRef.current?.focus();
  }, [diamondReviewOpen]);

  useEffect(() => {
    if (
      !committedAccountId ||
      loadedAccountId !== committedAccountId ||
      !committedClubId ||
      !itemId
    ) {
      setDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
      return;
    }
    const slot = {
      scope: `club-detail-${itemId}`,
      userId: committedAccountId,
      paymentMethod: 'diamonds',
    };
    const commerceIntent = item
      ? clubDetailDiamondIntent(item, committedAccountId, committedClubId, itemId)
      : null;
    try {
      const recovery = inspectCommerceRequestRecovery(commerceIntent || slot);
      setDiamondRecovery({
        ...recovery,
        commerceIntent,
        message:
          recovery.status === 'recoverable'
            ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID Even If Balance, Availability, Or Ownership Changed.'
            : recovery.status === 'terms-changed'
              ? PROTECTED_TERMS_CHANGED_MESSAGE
              : recovery.status === 'terms-unavailable'
                ? PROTECTED_TERMS_UNAVAILABLE_MESSAGE
                : null,
      });
    } catch (error) {
      setDiamondRecovery({
        status: 'unavailable',
        requestId: null,
        commerceIntent,
        message: error?.message || 'Secure Purchase Recovery Is Unavailable In This Browser.',
      });
    }
  }, [committedAccountId, committedClubId, item, itemId, loadedAccountId]);

  const openDiamondPurchaseReview = useCallback(() => {
    const authUser = getAuthUser();
    if (!authUser?.id) {
      setState({ kind: 'auth', message: 'Sign In Again Before Authorizing A Diamond Purchase.' });
      return false;
    }
    if (
      !item ||
      !clubId ||
      loadedAccountId !== authUser.id ||
      purchaseOwnerRef.current.accountId !== authUser.id ||
      purchaseOwnerRef.current.clubId !== clubId
    ) {
      setState({
        kind: 'error',
        message: 'Your Signed-In Account Changed. Reload This Item Before Purchasing.',
      });
      return false;
    }
    const commerceIntent = clubDetailDiamondIntent(item, authUser.id, clubId, itemId);
    if (!commerceIntent) {
      setState({ kind: 'error', message: 'The Current Club Offer Could Not Be Verified.' });
      return false;
    }
    let recovery;
    try {
      recovery = inspectCommerceRequestRecovery(commerceIntent);
    } catch (error) {
      setState({
        kind: 'error',
        message: error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.',
      });
      return false;
    }
    if (recovery.status === 'terms-changed') {
      setDiamondRecovery({
        ...recovery,
        commerceIntent,
        message: PROTECTED_TERMS_CHANGED_MESSAGE,
      });
      setState({ kind: 'error', message: PROTECTED_TERMS_CHANGED_MESSAGE });
      return false;
    }
    const purchaseWasResumed = recovery.status === 'recoverable';
    if (!purchaseWasResumed) {
      if (item.available !== true) {
        setState({ kind: 'error', message: 'This Item Is Not Available For Purchase.' });
        return false;
      }
      const projection = getClubDiamondPurchaseProjection(item.price, balance);
      if (
        Number(item.price) !== 0 &&
        (!projection || projection.hasDebt || projection.shortfall > 0)
      ) {
        setState({
          kind: 'error',
          message: 'Your Verified Diamond Balance Cannot Fund This Purchase.',
        });
        return false;
      }
    }
    let purchaseRequestId = recovery.requestId;
    if (!purchaseWasResumed) {
      try {
        purchaseRequestId = getOrCreateCommerceRequestId(commerceIntent);
      } catch (error) {
        setState({
          kind: 'error',
          message: error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.',
        });
        return false;
      }
    }
    setDiamondRecovery({
      status: 'recoverable',
      requestId: purchaseRequestId,
      commerceIntent,
      message: purchaseWasResumed
        ? 'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID Even If Balance, Availability, Or Ownership Changed.'
        : null,
    });
    setDiamondCommerceIntent(commerceIntent);
    setDiamondPurchaseRequestId(purchaseRequestId);
    setDiamondReviewIsRecovery(purchaseWasResumed);
    setDiamondReviewOpen(true);
    return true;
  }, [balance, clubId, item, itemId, loadedAccountId]);

  const purchaseWithDiamonds = useCallback(
    async (target = item) => {
      if (processingRef.current) return;
      const authUser = getAuthUser();
      const targetClub = target?.clubId || target?.club_id || clubId;
      if (!authUser?.id) {
        setState({ kind: 'auth', message: 'Sign In Again Before Authorizing A Diamond Purchase.' });
        return false;
      }
      if (!target || !targetClub) {
        setState({
          kind: 'error',
          message: 'Verified club item context is unavailable. Reload inventory and try again.',
        });
        return false;
      }
      if (
        loadedAccountId !== authUser.id ||
        purchaseOwnerRef.current.accountId !== authUser.id ||
        purchaseOwnerRef.current.clubId !== targetClub ||
        purchaseOwnerRef.current.itemId !== itemId ||
        target.id !== itemId
      ) {
        setDiamondReviewOpen(false);
        setDiamondPurchaseRequestId(null);
        setDiamondCommerceIntent(null);
        setDiamondReviewIsRecovery(false);
        setState({
          kind: 'error',
          message: 'Your Signed-In Account Changed. Reload This Item Before Purchasing.',
        });
        return false;
      }
      const expectedAccountId = authUser.id;
      const expectedClubId = targetClub;
      const reviewedIntent = diamondCommerceIntent?.intent;
      if (
        diamondCommerceIntent?.userId !== authUser.id ||
        reviewedIntent?.clubId !== targetClub ||
        reviewedIntent?.itemId !== target.id ||
        reviewedIntent?.expectedPrice !== Number(target.price)
      ) {
        setDiamondReviewOpen(false);
        setDiamondPurchaseRequestId(null);
        setDiamondCommerceIntent(null);
        setDiamondReviewIsRecovery(false);
        setState({
          kind: 'error',
          message: 'Purchase Details Changed. Review The Current Item Again Before Confirming.',
        });
        return false;
      }
      const reviewedRequestId = target.purchaseRequestId || diamondPurchaseRequestId;
      let recovery;
      try {
        recovery = inspectCommerceRequestRecovery(diamondCommerceIntent);
      } catch (error) {
        setState({
          kind: 'error',
          message: error?.message || 'Secure Purchase Recovery Is Unavailable. Please Try Again.',
        });
        return false;
      }
      if (recovery.status !== 'recoverable' || recovery.requestId !== reviewedRequestId) {
        setState({
          kind: 'error',
          message:
            recovery.status === 'terms-changed'
              ? PROTECTED_TERMS_CHANGED_MESSAGE
              : 'The Protected Purchase Identity Changed. Review The Current Offer Again.',
        });
        return false;
      }
      const purchaseWasResumed = diamondReviewIsRecovery === true;
      if (!purchaseWasResumed) {
        if (target.available !== true) {
          setState({ kind: 'error', message: 'This Item Is Not Available For Purchase.' });
          return false;
        }
        const diamondProjection = getClubDiamondPurchaseProjection(target.price, balance);
        if (
          Number(target.price) !== 0 &&
          (!diamondProjection || diamondProjection.hasDebt || diamondProjection.shortfall > 0)
        ) {
          setState({
            kind: 'error',
            message: 'Your Verified Diamond Balance Cannot Fund This Purchase.',
          });
          return false;
        }
      }
      const attemptId = ++diamondPurchaseAttemptRef.current;
      diamondPurchaseAbortRef.current?.abort();
      const controller = new AbortController();
      diamondPurchaseAbortRef.current = controller;
      const attemptIsCurrent = () =>
        !controller.signal.aborted &&
        diamondPurchaseAttemptRef.current === attemptId &&
        purchaseOwnerRef.current.accountId === expectedAccountId &&
        purchaseOwnerRef.current.clubId === expectedClubId &&
        getAuthUser()?.id === expectedAccountId;
      processingRef.current = true;
      setState({ kind: 'processing', message: 'Authorizing diamond wallet settlement…' });
      try {
        const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return false;
        if (!authorization) {
          throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
        }
        const durableRequestId = getOrCreateCommerceRequestId(diamondCommerceIntent);
        if (durableRequestId !== reviewedRequestId) {
          setDiamondPurchaseRequestId(durableRequestId);
          const refreshedIntentError = new Error(
            'Secure Purchase Recovery Was Refreshed. Review And Confirm Again.'
          );
          refreshedIntentError.code = 'COMMERCE_INTENT_REFRESHED';
          throw refreshedIntentError;
        }
        setDiamondReviewIsRecovery(true);
        setDiamondRecovery({
          status: 'recoverable',
          requestId: durableRequestId,
          commerceIntent: diamondCommerceIntent,
          message:
            'A Previous Purchase For These Exact Terms Is Protected. Verify Purchase Reuses Its Original Request ID Even If Balance, Availability, Or Ownership Changed.',
        });
        const response = await boundedCommerceFetch('/api/club-arena/marketplace-purchase', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authorization.accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': durableRequestId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            clubId: expectedClubId,
            itemId: target.id,
            expectedPrice: Number(target.price),
          }),
        });
        const body = await response.json().catch(() => null);
        if (!attemptIsCurrent()) return false;
        const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
          signal: controller.signal,
        });
        if (!attemptIsCurrent()) return false;
        if (!confirmedAuthorization) {
          throw new Error(
            'Your Signed-In Account Changed. The Original Purchase Still Needs Verification.'
          );
        }
        if (!response.ok || !body?.success) {
          const refusal = classifyClubPurchaseRefusal(response.status, body, {
            accountId: expectedAccountId,
            requestId: durableRequestId,
          });
          if (refusal.refreshInventory) {
            setDiamondReviewOpen(false);
            await loadItem({ preserveContext: true });
            if (!attemptIsCurrent()) return false;
          }
          setState({
            kind: 'error',
            message: 'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.',
          });
          return false;
        }
        const verifiedPurchase = normalizeVerifiedClubPurchaseSuccess(body, {
          accountId: expectedAccountId,
          requestId: durableRequestId,
          clubId: expectedClubId,
          itemId: target.id,
          name: target.catalog_name,
          itemType: target.item_type,
          price: target.price,
        });
        if (!verifiedPurchase) {
          setState({
            kind: 'error',
            message: 'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.',
          });
          return false;
        }
        if (!attemptIsCurrent()) return false;
        setBalance(verifiedPurchase.newBalance);
        const recoveryRetired = clearCommerceRequestId({
          ...diamondCommerceIntent,
          expectedRequestId: durableRequestId,
        });
        setDiamondReviewOpen(false);
        setDiamondReviewIsRecovery(false);
        if (recoveryRetired) {
          setDiamondPurchaseRequestId(null);
          setDiamondCommerceIntent(null);
          setDiamondRecovery(EMPTY_COMMERCE_RECOVERY);
        }
        window.dispatchEvent(
          new CustomEvent('smarter-poker:diamond-balance', {
            detail: {
              balance: verifiedPurchase.newBalance,
              userId: expectedAccountId,
              source: 'club-shop',
            },
          })
        );
        broadcastSync('smarter_poker_diamond_sync', 'refresh');
        setState({
          kind: 'complete',
          message: recoveryRetired
            ? `${target.name} is now in your club inventory.`
            : `${target.name} is now in your club inventory. Secure recovery could not be cleared, so do not submit it again until inventory refreshes.`,
        });
        return true;
      } catch (error) {
        if (!attemptIsCurrent() || error?.name === 'AbortError') return false;
        const safeRecoveryMessage =
          error?.code === 'COMMERCE_INTENT_PERSISTENCE_UNAVAILABLE' ||
          error?.code === 'COMMERCE_INTENT_REFRESHED'
            ? error.message
            : 'Purchase Status Is Uncertain. Confirm Again To Verify The Original Purchase.';
        setState({
          kind: 'error',
          message: safeRecoveryMessage,
        });
        return false;
      } finally {
        if (diamondPurchaseAbortRef.current === controller) {
          diamondPurchaseAbortRef.current = null;
          processingRef.current = false;
        }
      }
    },
    [
      balance,
      clubId,
      diamondCommerceIntent,
      diamondPurchaseRequestId,
      diamondReviewIsRecovery,
      item,
      loadItem,
      loadedAccountId,
    ]
  );

  const purchaseWithCard = async () => {
    if (processingRef.current) return;
    const authUser = getAuthUser();
    const cardQuote = normalizeClubCardQuote(item?.card_quote);
    if (!authUser?.id) {
      setState({ kind: 'auth', message: 'Sign in again before opening secure card checkout.' });
      return;
    }
    if (
      loadedAccountId !== authUser.id ||
      purchaseOwnerRef.current.accountId !== authUser.id ||
      purchaseOwnerRef.current.clubId !== clubId ||
      purchaseOwnerRef.current.itemId !== itemId
    ) {
      setState({
        kind: 'error',
        message: 'Your Signed-In Account Changed. Reload This Item Before Purchasing.',
      });
      return;
    }
    if (!item || !clubId || item.id !== itemId) {
      setState({
        kind: 'error',
        message: 'Verified club item context is unavailable. Reload inventory and try again.',
      });
      return;
    }
    if (item.available !== true) {
      setState({ kind: 'error', message: 'This Item Is Not Available For Purchase.' });
      return;
    }
    if (Number(balance) < 0) {
      setState({
        kind: 'error',
        message: 'Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above.',
      });
      return;
    }
    if (!cardQuote) {
      setState({ kind: 'error', message: 'Card Checkout Is Unavailable For This Item Price.' });
      return;
    }
    const expectedAccountId = authUser.id;
    const expectedClubId = clubId;
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
        itemId: item.id,
        itemPriceDiamonds: Number(item.price),
        cardChargeCents: cardQuote.cardChargeCents,
      }
    );
    if (
      !offerConfirmation ||
      offerConfirmation.totalCents !== cardQuote.cardChargeCents ||
      offerConfirmation.totalDiamonds + offerConfirmation.totalBonus !== cardQuote.diamondsPurchased
    ) {
      setState({
        kind: 'error',
        message: 'The Current Card Funding Quote Could Not Be Verified. Reload The Item.',
      });
      return;
    }
    const commerceIntent = {
      scope: `club-detail-card-${item.id}`,
      userId: expectedAccountId,
      paymentMethod: 'card',
      intent: {
        clubId: expectedClubId,
        itemId: item.id,
      },
    };
    const attemptId = ++cardCheckoutAttemptRef.current;
    cardCheckoutAbortRef.current?.abort();
    const controller = new AbortController();
    cardCheckoutAbortRef.current = controller;
    const attemptIsCurrent = () =>
      !controller.signal.aborted &&
      cardCheckoutAttemptRef.current === attemptId &&
      purchaseOwnerRef.current.accountId === expectedAccountId &&
      purchaseOwnerRef.current.clubId === expectedClubId &&
      getAuthUser()?.id === expectedAccountId;
    processingRef.current = true;
    setState({ kind: 'processing', message: 'Opening secure card checkout…' });
    let checkoutRequestId = null;
    try {
      const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
        signal: controller.signal,
      });
      if (!attemptIsCurrent()) return;
      if (!authorization) {
        throw new Error('Your Signed-In Account Changed. Review This Purchase Again.');
      }
      const origin = window.location.origin;
      checkoutRequestId = getOrCreateCommerceRequestId(commerceIntent);
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
            itemId: item.id,
            expectedPrice: Number(item.price),
            expectedCardChargeCents: cardQuote.cardChargeCents,
          },
          successUrl: `${origin}${canonical}?clubId=${expectedClubId}&success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}${canonical}?clubId=${expectedClubId}&canceled=true`,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!attemptIsCurrent()) return;
      if (!response.ok || !body?.success) {
        const checkoutError = new Error(body?.error?.message || 'Card Checkout Could Not Start.');
        checkoutError.code = body?.error?.code || null;
        throw checkoutError;
      }
      const checkoutSession = normalizeVerifiedCheckoutSession(
        body,
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
      leaveForCheckout(checkoutSession.url);
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
        await loadItem({ preserveContext: true });
        if (!attemptIsCurrent()) return;
      }
      setState({ kind: 'error', message: error?.message || 'Card checkout could not start.' });
    } finally {
      if (cardCheckoutAbortRef.current === controller) {
        cardCheckoutAbortRef.current = null;
        processingRef.current = false;
      }
    }
  };

  useEffect(() => {
    // Stripe return verification is owner-scoped by the server and must not
    // depend on the catalog row or membership still being present. An item can
    // be hidden while Checkout is open; the paid return still needs a truthful
    // receipt and current wallet balance.
    if (!router.isReady || router.query.success !== 'true' || !checkoutSessionId) return;
    if (!STRIPE_CHECKOUT_SESSION_ID_RE.test(checkoutSessionId)) {
      setState({ kind: 'error', message: 'The Checkout Reference Is Invalid. Reload This Item.' });
      return;
    }
    const expectedAccountId = committedAccountId;
    if (!expectedAccountId || getAuthUser()?.id !== expectedAccountId) {
      setState({ kind: 'auth', message: 'Sign In Again To Verify This Card Settlement.' });
      return;
    }
    let cancelled = false;
    let retryTimer = null;
    let wakeRetry = null;
    const statusController = new AbortController();
    const cleanDetailPath = () => {
      const returnClubId = clubId || requestedClubId;
      return returnClubId ? `${canonical}?clubId=${encodeURIComponent(returnClubId)}` : canonical;
    };
    const verify = async () => {
      setState({
        kind: 'processing',
        message: 'Verifying card settlement before granting the item…',
      });
      for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
        try {
          const authorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
            signal: statusController.signal,
          });
          if (!authorization) {
            throw new Error(
              'Your Signed-In Account Changed. Sign In To The Original Account And Reload.'
            );
          }
          const response = await boundedCommerceFetch(
            `/api/store/checkout-status?session_id=${encodeURIComponent(checkoutSessionId)}`,
            {
              headers: { Authorization: `Bearer ${authorization.accessToken}` },
              signal: statusController.signal,
            }
          );
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(
              typeof body?.error === 'string' ? body.error : 'Card Settlement Verification Failed.'
            );
          }
          const receipt = normalizeVerifiedCheckoutStatus(body, {
            sessionId: checkoutSessionId,
            accountId: expectedAccountId,
          });
          if (!receipt || receipt.type !== 'diamonds') {
            throw new Error(
              'The Card Settlement Response Could Not Be Verified. Reload This Item.'
            );
          }
          const confirmedAuthorization = await getVerifiedCheckoutAuthorization(expectedAccountId, {
            signal: statusController.signal,
          });
          if (!confirmedAuthorization) {
            throw new Error(
              'Your Signed-In Account Changed. Sign In To The Original Account And Reload.'
            );
          }
          if (receipt.status === 'failed') {
            if (!cancelled) {
              const recoveryRetired = clearCommerceRequestById({
                userId: expectedAccountId,
                paymentMethod: 'card',
                requestId: receipt.requestId,
              });
              if (!recoveryRetired) {
                setState({
                  kind: 'error',
                  message:
                    'Checkout Expired, But Secure Recovery Could Not Be Retired. Reload This Item.',
                });
                return;
              }
              setState({
                kind: 'error',
                message: 'Card Checkout Expired Without A Completed Payment. No Item Was Granted.',
              });
              await router.replace(cleanDetailPath(), undefined, { shallow: true });
            }
            return;
          }
          if (receipt.status === 'complete') {
            if (!cancelled) {
              if (
                receipt.purchaseKind !== 'club_shop' ||
                receipt.itemId !== itemId ||
                !['completed', 'needs_review'].includes(receipt.redemptionStatus)
              ) {
                throw new Error(
                  'The Club Item Delivery Could Not Be Bound To This Purchase. Reload This Item.'
                );
              }
              const recoveryRetired = clearCommerceRequestById({
                userId: expectedAccountId,
                paymentMethod: 'card',
                requestId: receipt.requestId,
              });
              if (!recoveryRetired) {
                setState({
                  kind: 'error',
                  message:
                    'Payment Was Verified, But Secure Recovery Could Not Be Retired. Reload This Item.',
                });
                return;
              }
              const verifiedWalletBalance = receipt.walletBalance;
              if (Number.isSafeInteger(verifiedWalletBalance)) {
                setBalance(verifiedWalletBalance);
                window.dispatchEvent(
                  new CustomEvent('smarter-poker:diamond-balance', {
                    detail: {
                      balance: verifiedWalletBalance,
                      userId: expectedAccountId,
                      source: 'checkout-status',
                    },
                  })
                );
                broadcastSync('smarter_poker_diamond_sync', 'refresh');
              }
              if (receipt.redemptionStatus === 'needs_review') {
                setState({
                  kind: 'error',
                  message:
                    'Your Card Payment And Diamond Funding Are Recorded, But This Item Was Not Purchased. Review The Updated Wallet And Current Item Price Before Finishing With Diamonds. Do Not Pay By Card Again.',
                });
                await router.replace(cleanDetailPath(), undefined, { shallow: true });
                return;
              }
              const completionMessage = `${receipt.label || item?.name || 'Club Shop Item'} Purchased Successfully. Card Settlement And Inventory Delivery Are Complete.`;
              if (clubId && item) {
                await loadItem({ preserveContext: true, completionMessage });
              } else {
                setState({ kind: 'complete', message: completionMessage });
              }
              if (cancelled) return;
              await router.replace(cleanDetailPath(), undefined, { shallow: true });
            }
            return;
          }
        } catch (error) {
          if (error?.name === 'AbortError' && cancelled) return;
          if (attempt === 5 && !cancelled) {
            setState({
              kind: 'error',
              message: error.message || 'Card Settlement Verification Failed. Reload This Item.',
            });
            return;
          }
        }
        await new Promise((resolve) => {
          wakeRetry = resolve;
          retryTimer = window.setTimeout(() => {
            wakeRetry = null;
            resolve();
          }, 1200);
        });
      }
      if (!cancelled) {
        setState({
          kind: 'error',
          message:
            'Card Settlement Is Still Pending. Reload This Page To Resume The Same Purchase.',
        });
      }
    };
    void verify();
    return () => {
      cancelled = true;
      statusController.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
      if (wakeRetry) wakeRetry();
    };
  }, [
    canonical,
    checkoutSessionId,
    clubId,
    committedAccountId,
    item,
    itemId,
    loadItem,
    requestedClubId,
    router,
    router.isReady,
    router.query.success,
  ]);

  const name = item?.name || 'Club Shop Equipment Record';
  const description = item?.description || state.message;
  const productArt = resolveClubShopProductArt(item);
  const image = productArt.source;
  const cardQuote = normalizeClubCardQuote(item?.card_quote);
  const diamondProjection = item ? getClubDiamondPurchaseProjection(item.price, balance) : null;
  const hasDiamondDebt = diamondProjection?.hasDebt === true;
  const cardCharge = cardQuote?.cardCharge ?? null;
  const cardDiamonds = cardQuote?.diamondsPurchased ?? null;
  const diamondPurchaseBalance = diamondProjection?.remainingBalance ?? null;
  const diamondShortfall = diamondProjection?.shortfall ?? null;
  const cardPurchaseBalance = cardQuote?.cardPurchaseBalance ?? null;
  const itemAvailable = item?.available === true;
  const isFreeItem = itemAvailable && Number(item?.price) === 0;
  const canPurchaseWithDiamonds =
    itemAvailable &&
    (isFreeItem ||
      (diamondProjection && !diamondProjection.hasDebt && diamondProjection.shortfall === 0));
  const hasExactDiamondRecovery = diamondRecovery.status === 'recoverable';
  const canOpenDiamondReview =
    !['terms-changed', 'terms-unavailable', 'unavailable'].includes(diamondRecovery.status) &&
    (hasExactDiamondRecovery || canPurchaseWithDiamonds);
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name,
    description,
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={name}
      description={description}
      eyebrow={`${item?.category || 'Club Equipment'} / member inventory`}
      image={image}
      imageCropPosition={productArt.kind === 'atlas' ? productArt.position : null}
      imageAlt={item ? `${item.name} club shop equipment` : 'Smarter.Poker futuristic club table'}
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Club Shop', href: clubShopReturnHref },
        { label: name, href: canonical },
      ]}
      price={cardCharge}
      diamondPrice={item?.price}
      status={state.kind === 'ready' && itemAvailable ? 'Club Verified' : state.message}
      presentation="product"
      actions={
        item && state.kind !== 'auth' ? (
          <>
            <button
              ref={diamondReviewTriggerRef}
              type="button"
              onClick={openDiamondPurchaseReview}
              disabled={state.kind === 'processing' || !canOpenDiamondReview}
            >
              {hasExactDiamondRecovery
                ? 'Verify Purchase'
                : isFreeItem
                  ? 'Review Free Claim'
                  : canPurchaseWithDiamonds
                    ? 'Review Diamond Purchase'
                    : 'Diamond Purchase Unavailable'}
            </button>
            <button
              type="button"
              onClick={purchaseWithCard}
              disabled={state.kind === 'processing' || !itemAvailable || cardCharge == null}
            >
              {cardCharge == null
                ? isFreeItem
                  ? 'No Card Charge Required'
                  : hasDiamondDebt
                    ? 'Card Checkout Paused'
                    : 'Card Checkout Unavailable'
                : `Buy With Card: $${cardCharge.toFixed(2)}`}
            </button>
          </>
        ) : (
          <>
            {state.kind === 'auth' && (
              <Link
                href={`/auth/login?redirect=${encodeURIComponent(`${canonical}${requestedClubId ? `?clubId=${requestedClubId}` : ''}`)}`}
              >
                Sign In To Buy This Item
              </Link>
            )}
            {state.kind === 'error' && (
              <button type="button" onClick={() => void loadItem()}>
                Retry Live Inventory
              </button>
            )}
            <Link href={clubShopReturnHref}>Return To Club Shop</Link>
          </>
        )
      }
      structuredData={schema}
      noindex
    >
      <div role="status" aria-live="polite" className={detailStyles.detailCard}>
        <h2>Live Purchase Console</h2>
        <p>{marketplaceCopy(state.message)}</p>
        {balance != null && (
          <p>
            Verified Wallet Balance: <strong>{balance.toLocaleString()} Diamonds</strong>.
          </p>
        )}
        {diamondRecovery.message && (
          <p role={hasExactDiamondRecovery ? 'status' : 'alert'}>
            {marketplaceCopy(diamondRecovery.message)}
          </p>
        )}
        {item && !itemAvailable && !hasExactDiamondRecovery && (
          <p role="alert">
            This Item Is Not Available For Purchase. Reload Live Inventory Before Trying Again.
          </p>
        )}
        {item?.on_sale && (
          <p>
            Sale Price: <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong>.
            Regular Price: <strong>{Number(item.list_price || 0).toLocaleString()} Diamonds</strong>
            .
          </p>
        )}
        {hasDiamondDebt && (
          <p role="alert">
            Card Checkout Is Paused Until Your Diamond Wallet Returns To Zero Or Above. This
            Prevents A Paid Order From Failing Its Automatic Item Redemption.
          </p>
        )}
        {diamondProjection && diamondShortfall > 0 && (
          <p>
            A Diamond Purchase Needs{' '}
            <strong>{diamondShortfall.toLocaleString()} More Diamonds</strong> At The Verified
            Balance Above.
          </p>
        )}
        {diamondProjection && diamondShortfall === 0 && !isFreeItem && (
          <p>
            A Diamond Purchase Redeems{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> And Leaves A
            Projected <strong>{diamondPurchaseBalance.toLocaleString()} Diamonds</strong> In Your
            Wallet Based On The Verified Balance Above.
          </p>
        )}
        {isFreeItem && (
          <p>
            This Item Is Free. Claiming It Does Not Change Your Diamond Wallet And Does Not Require
            A Card.
          </p>
        )}
        {cardQuote && (
          <p>
            Card Checkout Charges <strong>${cardCharge.toFixed(2)}</strong> For{' '}
            <strong>{cardDiamonds.toLocaleString()} New Diamonds</strong>, Redeems{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> For This Item, And
            Leaves A Projected <strong>{cardPurchaseBalance.toLocaleString()} Diamonds</strong> In
            Your Wallet Based On The Verified Balance Above.
          </p>
        )}
      </div>
      {item && diamondReviewOpen && (
        <section className={detailStyles.detailCard} aria-labelledby="club-diamond-review-title">
          <h2 id="club-diamond-review-title" ref={diamondReviewTitleRef} tabIndex={-1}>
            {diamondReviewIsRecovery ? 'Verify Purchase' : 'Confirm Diamond Purchase'}
          </h2>
          <p>
            {isFreeItem ? 'Claim' : 'Spend'}{' '}
            <strong>{Number(item.price || 0).toLocaleString()} Diamonds</strong> On{' '}
            {marketplaceCopy(item.name)}? The Server Will Recheck Availability, Limits, Price, And
            Your Wallet Before Deducting Anything.
          </p>
          {diamondReviewIsRecovery && (
            <p role="status">
              This Reuses The Original Protected Request. The Server Will Verify Its Authoritative
              Result Even If Balance, Availability, Or Ownership Changed.
            </p>
          )}
          <div className={detailStyles.actions}>
            <button
              type="button"
              onClick={() => {
                setDiamondReviewOpen(false);
                setDiamondPurchaseRequestId(null);
                setDiamondCommerceIntent(null);
                setDiamondReviewIsRecovery(false);
                window.requestAnimationFrame(() => diamondReviewTriggerRef.current?.focus());
              }}
              disabled={state.kind === 'processing'}
            >
              Keep Shopping
            </button>
            <button
              type="button"
              onClick={() => purchaseWithDiamonds()}
              disabled={
                state.kind === 'processing' ||
                (!diamondReviewIsRecovery && !canPurchaseWithDiamonds)
              }
            >
              {state.kind === 'processing'
                ? diamondReviewIsRecovery
                  ? 'Verifying…'
                  : 'Authorizing…'
                : diamondReviewIsRecovery
                  ? 'Verify Purchase'
                  : isFreeItem
                    ? 'Confirm Free Claim'
                    : `Confirm ${Number(item.price || 0).toLocaleString()} Diamonds`}
            </button>
          </div>
        </section>
      )}
    </MarketplaceDetailExperience>
  );
}

export function getServerSideProps({ params }) {
  const routeItemId = Array.isArray(params?.itemId) ? params.itemId[0] : params?.itemId;
  return {
    props: {
      routeItemId: typeof routeItemId === 'string' ? routeItemId : null,
    },
  };
}
