/**
 * LEAVING FOR THE HOSTED PAYMENT SURFACE
 * ─────────────────────────────────────────────────────────────────────────
 * A Marketplace page is not always the whole browser tab. Club Arena runs a
 * sanctioned same-origin iframe (its `HubFrame`) that shows a World Hub page
 * beside a running poker table, and a card checkout started in there used to
 * navigate THAT FRAME to Stripe. Two things break when it does:
 *
 *   1. Stripe Checkout answers with `X-Frame-Options: DENY`, so the frame
 *      goes blank at the exact moment the player is paying.
 *   2. `vercel.json` sends `Permissions-Policy: payment=()`, which disables
 *      Apple Pay and Google Pay inside a child frame even if it did render.
 *
 * Club Arena intercepts off-site ANCHOR clicks itself and states the rest of
 * the contract plainly: "a programmatic redirect off-site is the hub page's
 * own to break out of". This is that break-out, and it is the only navigation
 * the Marketplace hands an off-site URL.
 *
 * The decision is exported apart from the effect so it can be asserted
 * without a browser. `resolveCheckoutNavigation` never navigates and never
 * reads anything it has not been given.
 */

/** Only an absolute HTTPS URL is ever navigated to. */
function verifiedAbsoluteHttpsUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    // A relative path throws here without a base, which is the point: a
    // `javascript:` value, a protocol-relative value and a bare path all
    // fail this gate rather than becoming a navigation.
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch (_) {
    return null;
  }
}

/**
 * Report whether the top window is BOTH a different window and same-origin
 * enough to drive. Reading a cross-origin `location` throws a SecurityError,
 * which is exactly the signal that the break-out is not available.
 */
function topWindowIsReachable(win) {
  try {
    const top = win.top;
    if (!top || top === win) return false;
    if (typeof top.location?.assign !== 'function') return false;
    return typeof top.location.href === 'string';
  } catch (_) {
    return false;
  }
}

/**
 * Decide where a checkout URL is opened. Returns the exact URL to navigate to
 * and which window owns that navigation:
 *
 *   'top'   framed, and the top window is same-origin and reachable
 *   'self'  not framed, top unreadable (cross-origin), or top unusable
 *   'none'  the value is not an absolute HTTPS URL; nothing is navigated
 */
export function resolveCheckoutNavigation(value, win) {
  const url = verifiedAbsoluteHttpsUrl(value);
  if (!url) return { target: 'none', url: null };
  if (!win || typeof win.location?.assign !== 'function') return { target: 'none', url: null };
  return { target: topWindowIsReachable(win) ? 'top' : 'self', url };
}

/**
 * Navigate to a hosted checkout URL, breaking out of a sanctioned frame when
 * there is one. Returns the window that was navigated, or null when the value
 * was refused, so a caller can keep its durable checkout request for recovery.
 */
export function leaveForCheckout(value, win = typeof window === 'undefined' ? null : window) {
  const { target, url } = resolveCheckoutNavigation(value, win);
  if (target === 'none') return null;
  if (target === 'top') {
    try {
      win.top.location.assign(url);
      return 'top';
    } catch (_) {
      // The top window became unreachable between the check and the call.
      // Paying in this frame is still better than not leaving at all.
      win.location.assign(url);
      return 'self';
    }
  }
  win.location.assign(url);
  return 'self';
}

export default leaveForCheckout;
