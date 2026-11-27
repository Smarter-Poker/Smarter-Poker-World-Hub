import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthUser } from '../authUtils';
import { getVerifiedCheckoutAuthorization } from './checkoutAuthorization';
import { parseVipIntroOfferStatus, vipIntroPromptCopy, vipIntroPromptState } from './vipIntroPrompt.mjs';

/* Several prompts on one page ask the same question. They share one request
   per account for a short time; an explicit refresh() always asks again. */
const SHARED_TTL_MS = 60000;
const shared = new Map();

async function readIntroOffer(accountId) {
  try {
    const authorization = await getVerifiedCheckoutAuthorization(accountId);
    if (!authorization) return { eligible: null, reason: null };
    const response = await fetch('/api/store/vip-membership-status', {
      headers: { Authorization: `Bearer ${authorization.accessToken}` },
      cache: 'no-store',
    });
    const body = await response.json().catch(() => null);
    return parseVipIntroOfferStatus(response.ok, body);
  } catch (_) {
    return { eligible: null, reason: null };
  }
}

function sharedIntroOffer(accountId, force) {
  const cached = shared.get(accountId);
  if (!force && cached && Date.now() - cached.at < SHARED_TTL_MS) return cached.promise;
  const entry = { at: Date.now(), promise: null };
  entry.promise = readIntroOffer(accountId).then((result) => {
    // An unknown answer is never remembered: the next prompt asks again.
    if (result.eligible === null && shared.get(accountId) === entry) shared.delete(accountId);
    return result;
  });
  shared.set(accountId, entry);
  return entry.promise;
}

/**
 * Whether the $1 first VIP month applies to the signed-in account.
 *
 *   eligible === true   the server said this account has never subscribed
 *   eligible === false  the server said it has; show and charge the regular price
 *   eligible === null   not known yet, or it could not be read
 *
 * `display` is what a price label should use: a signed-out visitor is shown
 * the offer (it is the price a new member pays), a signed-in member is shown
 * it only once the server has confirmed it. Checkout decides again on the
 * server and refuses when its answer differs, so this is never the authority.
 *
 * `reason` is the server's optional explanation for an ineligible account
 * (for example 'verify_contact'); null when the route does not send one.
 * `enabled: false` asks nothing, for a prompt that is not on screen.
 */
export function useVipIntroOffer(accountId, { enabled = true } = {}) {
  const [state, setState] = useState({ accountId: null, eligible: null, reason: null });
  const requestRef = useRef(0);

  const load = useCallback(async (force) => {
    const requestId = ++requestRef.current;
    if (!accountId || !enabled) {
      setState({ accountId: null, eligible: null, reason: null });
      return null;
    }
    const { eligible, reason } = await sharedIntroOffer(accountId, force);
    if (requestRef.current === requestId) setState({ accountId, eligible, reason });
    return eligible;
  }, [accountId, enabled]);

  const refresh = useCallback(() => load(true), [load]);

  useEffect(() => {
    load(false);
  }, [load]);

  const current = state.accountId === accountId;
  const eligible = current ? state.eligible : null;
  const reason = current && eligible === false ? state.reason : null;
  return { eligible, reason, display: accountId ? eligible === true : true, refresh };
}

/**
 * The price wording an upgrade prompt shows. Pass the page's signed-in user
 * id when it has one; otherwise the stored session is read after mount, so the
 * server render and the first client render agree. Until that read, the
 * regular price is shown: the offer is never flashed at a signed-in member.
 */
export function useVipIntroPrompt(accountId, { enabled = true } = {}) {
  // undefined = the stored session has not been read yet; null = signed out.
  const [storedId, setStoredId] = useState(undefined);
  useEffect(() => {
    if (accountId || !enabled) return;
    let id = null;
    try { id = getAuthUser()?.id || null; } catch (_) { id = null; }
    setStoredId(id);
  }, [accountId, enabled]);

  const resolvedId = accountId || storedId || null;
  const offer = useVipIntroOffer(resolvedId, { enabled });
  const input = {
    accountId: resolvedId,
    eligible: offer.eligible,
    reason: offer.reason,
    sessionKnown: Boolean(accountId) || storedId !== undefined,
  };
  return { state: vipIntroPromptState(input), copy: vipIntroPromptCopy(input), accountId: resolvedId };
}
