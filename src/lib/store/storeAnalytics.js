import { capture } from '../analytics';

const STORE_EVENT_PREFIX = 'store_';

function cleanProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) =>
      ['string', 'number', 'boolean'].includes(typeof value)
    )
  );
}
export function captureStoreEvent(event, properties = {}) {
  capture(`${STORE_EVENT_PREFIX}${event}`, cleanProperties(properties));
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
