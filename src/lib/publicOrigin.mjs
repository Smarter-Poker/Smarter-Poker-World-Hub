export const CANONICAL_PUBLIC_HOST = 'smarter.poker';
export const DEFAULT_PUBLIC_ORIGIN = `https://${CANONICAL_PUBLIC_HOST}`;

export function getCanonicalPublicOrigin(configured = process.env.NEXT_PUBLIC_BASE_URL) {
  if (!configured) return DEFAULT_PUBLIC_ORIGIN;

  try {
    const parsed = new URL(String(configured).trim());
    if (parsed.protocol === 'https:' && parsed.hostname === CANONICAL_PUBLIC_HOST) {
      return parsed.origin;
    }
  } catch {
    // Invalid configuration fails closed to the canonical production origin.
  }

  return DEFAULT_PUBLIC_ORIGIN;
}

export function canonicalPublicUrl(pathname, configured) {
  const origin = getCanonicalPublicOrigin(configured);
  const safePath = typeof pathname === 'string' && pathname.startsWith('/')
    ? pathname
    : '/';
  const resolved = new URL(safePath, origin);
  return resolved.origin === origin ? resolved.toString() : `${origin}/`;
}
