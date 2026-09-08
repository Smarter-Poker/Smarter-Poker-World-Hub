const LOCAL_ORIGIN = 'https://smarter.poker';

const cleanPathname = (pathname) => {
  const value = String(pathname || '/').replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  return value || '/';
};

export const parseWorldMenuHref = (value) => {
  try {
    const url = new URL(String(value || '/'), LOCAL_ORIGIN);
    return {
      pathname: cleanPathname(url.pathname),
      searchParams: url.searchParams,
    };
  } catch (_) {
    return { pathname: '/', searchParams: new URLSearchParams() };
  }
};

const queryMatches = (current, destination) => {
  for (const [key, value] of destination.searchParams.entries()) {
    if (current.searchParams.get(key) !== value) return false;
  }
  return true;
};

const routeScore = (current, destination) => {
  if (!queryMatches(current, destination)) return -1;
  const queryWeight = [...destination.searchParams.keys()].length * 100;

  if (current.pathname === destination.pathname) return 10_000 + queryWeight;
  if (current.pathname.startsWith(`${destination.pathname}/`)) {
    return 1_000 + destination.pathname.length + queryWeight;
  }
  return -1;
};

/**
 * Select exactly one current command. Query-bearing destinations outrank their
 * path-only sibling, while the longest owned path wins for nested screens.
 */
export const getActiveWorldMenuHref = (currentHref, items = []) => {
  const current = parseWorldMenuHref(currentHref);
  let winner = null;
  let winnerScore = -1;

  for (const item of items) {
    if (!item?.href) continue;
    const score = routeScore(current, parseWorldMenuHref(item.href));
    if (score > winnerScore) {
      winner = item.href;
      winnerScore = score;
    }
  }

  if (winner) return winner;

  const defaultItem = items.find((item) =>
    item?.href && item?.defaultForPath &&
    parseWorldMenuHref(item.href).pathname === current.pathname
  );
  return defaultItem?.href || null;
};

export const isWorldMenuHrefActive = (currentHref, candidateHref, items = []) =>
  Boolean(candidateHref) && getActiveWorldMenuHref(currentHref, items) === candidateHref;

export const isModifiedNavigationEvent = (event) =>
  Boolean(
    event?.metaKey || event?.ctrlKey || event?.shiftKey || event?.altKey ||
    (typeof event?.button === 'number' && event.button !== 0)
  );

/** Pure activation policy used by the UI and regression tests. */
export const evaluateWorldMenuActivation = ({
  event,
  href,
  lock = null,
  now = Date.now(),
  lockWindowMs = 1_200,
}) => {
  if (isModifiedNavigationEvent(event)) {
    return { allow: true, modified: true, nextLock: lock };
  }
  if (lock?.expiresAt > now) {
    return { allow: false, modified: false, nextLock: lock };
  }
  return {
    allow: true,
    modified: false,
    nextLock: { href: String(href || ''), expiresAt: now + lockWindowMs },
  };
};
