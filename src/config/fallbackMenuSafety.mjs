const hasHref = (item) =>
  typeof item?.href === 'string' && item.href.trim().length > 0;

const hasInternalAction = (item) => item?.openInviteModal === true;

const isContent = (item) => item?.type !== 'section' && item?.type !== 'divider';

const hasHandler = (value) => typeof value === 'function';

/*
 * ONE SETTINGS, AND IT IS THE ACCOUNT (Dan, 2026-11-05).
 * "If I'm inside the World Hub and I click Settings, it should be settings for
 * the World Hub, my account, and never a random World Hub page settings!"
 *
 * Before this, a drawer could carry a bottom "Settings", a second "Settings"
 * row in its body, a "Settings" section of page toggles, and deep links such as
 * "Privacy Settings" / "Blocked Users" / "Payment Methods" into individual
 * account tabs - and the account page itself reopened whichever tab was used
 * last (often Notifications, which reads as social settings).
 *
 * Every drawer, automatic or page-provided, now passes through this:
 *   - every row that routes to /hub/settings (any ?section=) is removed from
 *     the body and the footer links;
 *   - exactly one footer link named "Settings" is added, to the account tab;
 *   - a page's own toggle group is a "Preferences" section, never "Settings".
 * /hub/settings/notifications is a different page (device push) and is kept.
 */
export const ACCOUNT_SETTINGS_HREF = '/hub/settings?section=account';

export const isAccountSettingsHref = (href) =>
  typeof href === 'string' && href.split(/[?#]/, 1)[0].replace(/\/+$/, '') === '/hub/settings';

const routesToAccountSettings = (item) => isAccountSettingsHref(item?.href);

export function enforceAccountSettingsEntry(config = {}) {
  const source = config || {};
  let icon = null;
  const note = (item) => { if (!icon && item?.icon) icon = item.icon; };
  const menuItems = (Array.isArray(source.menuItems) ? source.menuItems : []).flatMap((item) => {
    if (!item || typeof item !== 'object') return [item];
    if (item.type === 'section' && typeof item.label === 'string' && /settings/i.test(item.label)) {
      return [{ ...item, label: item.label.replace(/settings/gi, 'Preferences') }];
    }
    if (item.type === 'grid') {
      const items = (Array.isArray(item.items) ? item.items : []).filter((g) => {
        if (routesToAccountSettings(g)) { note(g); return false; }
        return true;
      });
      return items.length ? [{ ...item, items }] : [];
    }
    if (routesToAccountSettings(item)) { note(item); return []; }
    return [item];
  });
  // A section whose rows were all settings links is now a heading over
  // nothing (or over the next group): drop it.
  const keptItems = menuItems.filter((item, index) => {
    if (item?.type !== 'section') return true;
    const next = menuItems[index + 1];
    return Boolean(next && next.type !== 'section' && next.type !== 'divider');
  });
  const bottomLinks = (Array.isArray(source.bottomLinks) ? source.bottomLinks : []).filter((item) => {
    if (routesToAccountSettings(item) || (item && item.label === 'Settings')) { note(item); return false; }
    return true;
  });
  bottomLinks.push({ id: 'account-settings', label: 'Settings', href: ACCOUNT_SETTINGS_HREF, ...(icon ? { icon } : {}) });
  return { ...source, menuItems: keptItems, bottomLinks };
}

const sanitizeMenuConfig = (rawConfig, allowPageHandlers) => {
  const config = enforceAccountSettingsEntry(rawConfig);
  const allowsAction = (item) =>
    hasInternalAction(item) || (allowPageHandlers && hasHandler(item?.onClick));

/**
 * Automatic World Hub menus do not own page state or page action handlers.
 * Keep their route navigation and the drawer-owned invite action, but remove
 * controls whose apparent behaviour would otherwise be a no-op (or a closure
 * over a missing handler). The provided-menu variant applies the same structural
 * cleanup while retaining controls that have real page-owned handlers.
 */
  const source = config || {};
  const candidates = (Array.isArray(source.menuItems) ? source.menuItems : [])
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      if (item.type === 'navigation') return hasHref(item) ? item : null;
      if (item.type === 'action') return allowsAction(item) ? item : null;
      if (item.type === 'toggle') {
        return allowPageHandlers && hasHandler(item.onChange) ? item : null;
      }
      if (item.type === 'grid') {
        const items = (Array.isArray(item.items) ? item.items : []).filter(
          (gridItem) => hasHref(gridItem) || allowsAction(gridItem)
        );
        return items.length > 0 ? { ...item, items } : null;
      }
      if (item.type === 'section' || item.type === 'divider') return item;
      return hasHref(item) ? item : null;
    })
    .filter(Boolean);

  const withoutEmptySections = candidates.filter((item, index) => {
    if (item.type !== 'section') return true;
    for (let cursor = index + 1; cursor < candidates.length; cursor += 1) {
      const next = candidates[cursor];
      if (next.type === 'section') return false;
      if (isContent(next)) return true;
    }
    return false;
  });

  const menuItems = withoutEmptySections.filter((item, index, items) => {
    if (item.type !== 'divider') return true;
    const previous = items[index - 1];
    const next = items[index + 1];
    return Boolean(
      previous &&
      next &&
      previous.type !== 'divider' &&
      previous.type !== 'section' &&
      next.type !== 'divider'
    );
  });

  const bottomLinks = (Array.isArray(source.bottomLinks) ? source.bottomLinks : [])
    .filter((item) => hasHref(item) || allowsAction(item));

  return { ...source, menuItems, bottomLinks };
};

export function sanitizeFallbackMenuConfig(config = {}) {
  return sanitizeMenuConfig(config, false);
}

export function sanitizeProvidedMenuConfig(config = {}) {
  return sanitizeMenuConfig(config, true);
}
