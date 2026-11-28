import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  DEFAULT_TOKE_PREFS,
  TOKE_PREFS_EVENT,
  TOKE_PREFS_KEY,
  mergePrefs,
  prefsFromAccount,
  readStoredPrefs,
  saveTokePrefsToAccount,
  writeStoredPrefs,
} from '../../../lib/bankroll/tokePrefs.mjs';

/**
 * Toke Tracker preferences for every Toke Tracker page, plus the hamburger
 * menu handlers that change them. See tokePrefs.mjs for why this is shared.
 */
export function useTokePrefs(userId) {
  const [prefs, setPrefs] = useState(DEFAULT_TOKE_PREFS);
  const prefsRef = useRef(prefs);
  // Counts preference changes made after load (this tab or another), so a
  // slower account read cannot overwrite a newer toggle with its older copy.
  const editsRef = useRef(0);
  const apply = useCallback((next) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  // This browser's copy first: it is instant and works signed out.
  useEffect(() => {
    const stored = readStoredPrefs(window.localStorage);
    if (stored) apply(mergePrefs(prefsRef.current, stored));
  }, [apply]);

  // Then the account's copy, which wins and is kept locally.
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    const editsAtRead = editsRef.current;
    supabase.from('profiles').select('settings').eq('id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        if (!live) return;
        const next = prefsFromAccount(prefsRef.current, data?.settings?.tokeTracker, editsRef.current !== editsAtRead);
        if (!next) return;
        apply(next);
        writeStoredPrefs(window.localStorage, next);
      })
      .catch((e) => console.warn('[TokeTracker] Preferences could not be read:', e?.message || e));
    return () => { live = false; };
  }, [userId, apply]);

  // Same tab (another mounted Toke Tracker surface) and other tabs.
  useEffect(() => {
    const onSync = (event) => {
      if (!event.detail) return;
      editsRef.current += 1;
      apply(mergePrefs(prefsRef.current, event.detail));
    };
    const onStorage = (event) => {
      if (event.key !== TOKE_PREFS_KEY) return;
      const stored = readStoredPrefs(window.localStorage);
      if (!stored) return;
      editsRef.current += 1;
      apply(mergePrefs(prefsRef.current, stored));
    };
    window.addEventListener(TOKE_PREFS_EVENT, onSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(TOKE_PREFS_EVENT, onSync);
      window.removeEventListener('storage', onStorage);
    };
  }, [apply]);

  const updatePref = useCallback(async (key, value) => {
    const next = mergePrefs(prefsRef.current, { [key]: value });
    editsRef.current += 1;
    apply(next);
    writeStoredPrefs(window.localStorage, next);
    window.dispatchEvent(new CustomEvent(TOKE_PREFS_EVENT, { detail: next }));
    if (!userId) return;
    try {
      await saveTokePrefsToAccount(supabase, next);
    } catch (err) {
      console.warn('[TokeTracker] Preference could not be saved to the account:', err?.message || err);
    }
  }, [userId, apply]);

  const handlers = {
    setShiftNotifications: (v) => updatePref('shiftNotifications', v),
    setAutoSaveShifts: (v) => updatePref('autoSaveShifts', v),
    setDownTimerAlerts: (v) => updatePref('downTimerAlerts', v),
  };

  return { prefs, updatePref, handlers };
}
