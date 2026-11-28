// Toke Tracker preferences (Shift Notifications, Auto-Save Shifts, Down Timer
// Alerts): one definition for all five Toke Tracker pages.
//
// Each page used to carry its own copy of this logic, and they disagreed: the
// landing page read the preferences saved on the account, the four tool pages
// read only this browser's localStorage. A dealer who turned Down Timer Alerts
// off on one phone still got the alert on the Shift Tracker of another,
// because that page never asked the account. Every page now reads local first
// (instant), then the account, and writes the account's answer back locally.

export const TOKE_PREFS_KEY = 'toke-tracker-prefs';
export const TOKE_PREFS_EVENT = 'toke-settings-sync';

export const DEFAULT_TOKE_PREFS = Object.freeze({
  shiftNotifications: true,
  autoSaveShifts: true,
  downTimerAlerts: true,
});

const KEYS = Object.keys(DEFAULT_TOKE_PREFS);

/** Only the known keys, only booleans. Anything else is ignored. */
export function cleanPrefs(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const key of KEYS) if (typeof value[key] === 'boolean') out[key] = value[key];
  return out;
}

export function mergePrefs(base, update) {
  return { ...DEFAULT_TOKE_PREFS, ...cleanPrefs(base), ...cleanPrefs(update) };
}

/**
 * The preferences to show once the account's copy arrives, or null to keep
 * what is shown. The account read starts on page load; a toggle made (here or
 * in another tab) before it answers is newer than that answer and was itself
 * written to the account, so the older answer must not flip it back.
 */
export function prefsFromAccount(current, remote, editedSinceRead) {
  if (editedSinceRead || !remote || typeof remote !== 'object' || Array.isArray(remote)) return null;
  return mergePrefs(current, remote);
}

/** The preferences this browser saved, or null. Never throws. */
export function readStoredPrefs(storage) {
  try {
    const raw = storage?.getItem(TOKE_PREFS_KEY);
    if (!raw) return null;
    const parsed = cleanPrefs(JSON.parse(raw));
    return Object.keys(parsed).length ? parsed : null;
  } catch (_e) {
    return null;
  }
}

export function writeStoredPrefs(storage, prefs) {
  try {
    storage?.setItem(TOKE_PREFS_KEY, JSON.stringify(mergePrefs(prefs)));
    return true;
  } catch (_e) {
    return false;
  }
}

/** The profile settings object with this tracker's preferences replaced. */
export function withTokePrefs(settings, prefs) {
  const base = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return { ...base, tokeTracker: mergePrefs(prefs) };
}

/**
 * Save the preferences to the account's profiles.settings.tokeTracker.
 *
 * fn_profile_settings_set_key (supabase/migrations/20261128101635_fn_profile_settings_set_key.sql,
 * installed 2026-11-28) merges just this one key in a single UPDATE of the
 * caller's own row, so a concurrent writer of another settings key is never
 * overwritten. The read-whole/write-whole update it replaced lost such keys;
 * its temporary PGRST202 fallback (#3296) covered only the hours before the
 * function was installed and was removed once it was verified on production.
 * Any failure is thrown to the caller.
 */
export async function saveTokePrefsToAccount(client, prefs) {
  const { error } = await client.rpc('fn_profile_settings_set_key', { p_key: 'tokeTracker', p_value: mergePrefs(prefs) });
  if (error) throw error;
}
