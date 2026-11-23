/**
 * Safe read-merge-write persistence helpers for /hub/settings.
 *
 * - profiles.settings owns rail_opt_in (read by Phase 7 rail_human stories via
 *   profiles.settings->>'rail_opt_in' = 'true') alongside training and toke
 *   tracker settings.
 * - profiles.app_settings owns hub UI settings alongside cross-surface keys
 *   such as poker_card_presets (written via appSettingsSync.js).
 *
 * Every write reads the latest JSONB column first and aborts without writing
 * if the SELECT fails, so sibling keys are never clobbered.
 */

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function readRailOptIn(profileSettings) {
  const value = asPlainObject(profileSettings).rail_opt_in;
  return value === true || value === 'true';
}

export async function saveProfileRailOptIn(db, userId, value) {
  if (!db?.from || !userId) {
    return { ok: false, aborted: true, error: new Error('Missing database client or user id') };
  }

  const { data: profile, error: readError } = await db
    .from('profiles')
    .select('settings')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    return { ok: false, aborted: true, error: readError };
  }

  const merged = {
    ...asPlainObject(profile?.settings),
    rail_opt_in: Boolean(value),
  };

  const { error: writeError } = await db
    .from('profiles')
    .update({ settings: merged })
    .eq('id', userId);

  if (writeError) {
    return { ok: false, aborted: false, error: writeError };
  }

  return { ok: true, aborted: false, error: null, settings: merged };
}

export async function saveProfileAppSettings(db, userId, patch, retiredKeys = []) {
  if (!db?.from || !userId) {
    return { ok: false, aborted: true, error: new Error('Missing database client or user id') };
  }

  const { data: profile, error: readError } = await db
    .from('profiles')
    .select('app_settings')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    return { ok: false, aborted: true, error: readError };
  }

  const merged = {
    ...asPlainObject(profile?.app_settings),
    ...asPlainObject(patch),
  };

  for (const retiredKey of Array.isArray(retiredKeys) ? retiredKeys : []) {
    delete merged[retiredKey];
  }
  delete merged.railOptIn;

  const { error: writeError } = await db
    .from('profiles')
    .update({ app_settings: merged })
    .eq('id', userId);

  if (writeError) {
    return { ok: false, aborted: false, error: writeError };
  }

  return { ok: true, aborted: false, error: null, app_settings: merged };
}

export default {
  readRailOptIn,
  saveProfileRailOptIn,
  saveProfileAppSettings,
};
