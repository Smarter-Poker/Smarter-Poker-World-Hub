const hasHref = (item) =>
  typeof item?.href === 'string' && item.href.trim().length > 0;

const hasInternalAction = (item) => item?.openInviteModal === true;

const isContent = (item) => item?.type !== 'section' && item?.type !== 'divider';

const hasHandler = (value) => typeof value === 'function';

const sanitizeMenuConfig = (config, allowPageHandlers) => {
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
