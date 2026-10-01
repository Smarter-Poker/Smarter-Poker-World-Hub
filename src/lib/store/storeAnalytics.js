const STORE_EVENT_PREFIX = 'store_';
const SESSION_KEY = 'smarter-marketplace-analytics-session';

function cleanProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value)
    )
  );
}
export function captureStoreEvent(event, properties = {}) {
  if (typeof window === 'undefined' || !window.crypto?.randomUUID) return;
  try {
    let sessionId = window.sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = window.crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    const route = typeof properties.route === 'string' ? properties.route : 'unknown';
    const payload = JSON.stringify({
      eventId: window.crypto.randomUUID(),
      sessionId,
      eventName: `${STORE_EVENT_PREFIX}${event}`,
      route,
      properties: cleanProperties(properties),
    });
    void fetch('/api/store/analytics-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {});
  } catch (_) {
    // Analytics never blocks a purchase, route change, or page render.
  }
}

export function createCheckoutRequestId(scope = 'store') {
  const safeScope = String(scope || 'store')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 24);

  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return `${safeScope}-${window.crypto.randomUUID()}`;
  }

  return `${safeScope}-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
}
