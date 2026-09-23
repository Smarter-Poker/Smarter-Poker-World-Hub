/**
 * CLUB SHOP DEEP LINKS: /hub/club-shop?clubId=<uuid>&view=<sub-view>
 * ─────────────────────────────────────────────────────────────────────────
 * The Club Shop tab has three sub-views held in component state, so until now
 * the only way to reach "My Purchases" or "Manage" was to click for it. A
 * link handed over from Club Arena has no click to offer, so `?view=` selects
 * one on arrival. Anything unrecognised, and the absent case, keep the
 * storefront: a deep link is a shortcut, never a new failure mode.
 *
 * Two things make this more than a string compare:
 *
 *   1. The page's route-identity and account effects deliberately reset the
 *      sub-view to 'store' whenever the account or the club changes. The
 *      requested view therefore has to be RE-APPLIED after a reset rather
 *      than set once at mount.
 *   2. The operator role arrives with the club shop snapshot, asynchronously.
 *      Until it does, nobody is an admin, so `?view=manage` must WAIT rather
 *      than decide - `settled: false` means "ask again when the role lands".
 *      A player who turns out not to be an operator gets the storefront, not
 *      the empty space where an operator's panel would render.
 */

export const CLUB_SHOP_DEEP_LINK_VIEWS = Object.freeze(['my-purchases', 'manage']);

/** Accept only a sub-view this page actually renders. */
export function normalizeClubShopDeepLinkView(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  const view = raw.trim().toLowerCase();
  return CLUB_SHOP_DEEP_LINK_VIEWS.includes(view) ? view : null;
}

/**
 * Resolve a requested view into the sub-view to show.
 *
 *   settled    false means the role is not known yet and nothing is applied.
 *   subTab     the sub-view to select once settled.
 *   loadAdmin  true when landing here must fetch the operator report, the
 *              way clicking Manage does.
 */
export function resolveClubShopDeepLinkSubTab(requestedView, options = {}) {
  const { isAdmin = false, roleResolved = false } = options;
  const view = normalizeClubShopDeepLinkView(requestedView);
  if (!view) return { settled: true, subTab: 'store', loadAdmin: false };
  if (view === 'manage') {
    if (!roleResolved) return { settled: false, subTab: 'store', loadAdmin: false };
    if (!isAdmin) return { settled: true, subTab: 'store', loadAdmin: false };
    return { settled: true, subTab: 'manage', loadAdmin: true };
  }
  return { settled: true, subTab: view, loadAdmin: false };
}
