/**
 * Resolve the portrait used by every global-header implementation.
 *
 * `avatar_url` is the uploaded profile photo. `arena_avatar_url` is the
 * separate Club Arena character/avatar. The character is never allowed to
 * replace the global photo unless the user explicitly enables the existing
 * "Use Avatar" preference.
 */
export function resolveHeaderPortrait(profilePhotoUrl, arenaAvatarUrl, useAvatarAsProfilePic) {
  if (useAvatarAsProfilePic) return arenaAvatarUrl || profilePhotoUrl || null;
  return profilePhotoUrl || null;
}

export function resolveActiveVip(isVip, expiresAt, now = Date.now()) {
  if (!isVip) return false;
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

export default resolveHeaderPortrait;
