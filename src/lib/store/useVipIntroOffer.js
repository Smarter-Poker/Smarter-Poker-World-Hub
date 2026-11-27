import { useCallback, useEffect, useRef, useState } from 'react';
import { getVerifiedCheckoutAuthorization } from './checkoutAuthorization';

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
 */
export function useVipIntroOffer(accountId) {
  const [state, setState] = useState({ accountId: null, eligible: null });
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (!accountId) {
      setState({ accountId: null, eligible: null });
      return null;
    }
    let eligible = null;
    try {
      const authorization = await getVerifiedCheckoutAuthorization(accountId);
      if (authorization) {
        const response = await fetch('/api/store/vip-membership-status', {
          headers: { Authorization: `Bearer ${authorization.accessToken}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => null);
        if (response.ok && body?.success && typeof body?.introOffer?.eligible === 'boolean') {
          eligible = body.introOffer.eligible;
        }
      }
    } catch (_) {
      eligible = null;
    }
    if (requestRef.current === requestId) setState({ accountId, eligible });
    return eligible;
  }, [accountId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const eligible = state.accountId === accountId ? state.eligible : null;
  return { eligible, display: accountId ? eligible === true : true, refresh };
}
