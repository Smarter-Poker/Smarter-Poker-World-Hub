const GUEST_FAVORITES_KEY = 'sp-training-guest-favorites';

export function readGuestTrainingFavorites(storage) {
  const raw = storage.getItem(GUEST_FAVORITES_KEY);
  if (!raw) return new Set();
  try {
    const ids = JSON.parse(raw);
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

export function toggleGuestTrainingFavorite(storage, gameId) {
  const next = readGuestTrainingFavorites(storage);
  if (next.has(gameId)) next.delete(gameId);
  else next.add(gameId);
  storage.setItem(GUEST_FAVORITES_KEY, JSON.stringify([...next]));
  return next;
}
