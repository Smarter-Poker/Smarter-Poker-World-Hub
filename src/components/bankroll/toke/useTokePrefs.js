import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import {
  DEFAULT_TOKE_PREFS,
  TOKE_PREFS_EVENT,
  TOKE_PREFS_KEY,
  mergePrefs,
  readStoredPrefs,
  withTokePrefs,
  writeStoredPrefs,
} from '../../../lib/bankroll/tokePrefs.mjs';

/**
 * Toke Tracker preferences for every Toke Tracker page, plus the hamburger
 * menu handlers that change them. See tokePrefs.mjs for why this is shared.
 */
export function useTokePrefs(userId) {
  const [prefs, setPrefs] = useState(DEFAULT_TOKE_PREFS);
  const prefsRef = useRef(prefs);
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
    supabase.from('profiles').select('settings').eq('id', userId).maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        const remote = data?.settings?.tokeTracker;
        if (!live || !remote || typeof remote !== 'object') return;
        const next = mergePrefs(prefsRef.current, remote);
        apply(next);
        writeStoredPrefs(window.localStorage, next);
      })
      .catch((e) => console.warn('[TokeTracker] Preferences could not be read:', e?.message || e));
    return () => { live = false; };
  }, [userId, apply]);

  // Same tab (another mounted Toke Tracker surface) and other tabs.
  useEffect(() => {
    const onSync = (event) => { if (event.detail) apply(mergePrefs(prefsRef.current, event.detail)); };
    const onStorage = (event) => {
      if (event.key !== TOKE_PREFS_KEY) return;
      const stored = readStoredPrefs(window.localStorage);
      if (stored) apply(mergePrefs(prefsRef.current, stored));
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
    apply(next);
    writeStoredPrefs(window.localStorage, next);
    window.dispatchEvent(new CustomEvent(TOKE_PREFS_EVENT, { detail: next }));
    if (!userId) return;
    try {
      const { data: profile, error: readError } = await supabase
        .from('profiles').select('settings').eq('id', userId).maybeSingle();
      if (readError) throw readError;
      const { error } = await supabase
        .from('profiles').update({ settings: withTokePrefs(profile?.settings, next) }).eq('id', userId);
      if (error) throw error;
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
