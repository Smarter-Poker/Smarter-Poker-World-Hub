import { getFreshAccessToken, getAccessToken } from './authUtils';

/**
 * Remove an owner's Reel. The server resolves reconciliation aliases and
 * quarantines the complete group;
 * clients must never delete social_reels rows directly.
 */
export async function removeOwnedReels({ reelId } = {}) {
  if (!reelId) throw new Error('A Reel is required');
  const token = typeof getFreshAccessToken === 'function'
    ? await getFreshAccessToken()
    : getAccessToken();
  if (!token) throw new Error('Sign in again to remove this Reel');

  const response = await fetch('/api/reels/remove', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reel_id: reelId }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || 'The Reel could not be removed');
  }
  return payload;
}
