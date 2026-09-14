/**
 * useTokePrefs: the Toke Tracker preference state, once.
 *
 * WHY: every one of the five Toke Tracker pages carried the same 40 lines
 * (hydrate from localStorage, mirror to profiles.settings.tokeTracker, sync
 * across tabs with a `toke-settings-sync` CustomEvent, hand three setters to
 * the hamburger menu). Five copies drifted: the landing page read Supabase
 * first, the four subpages read localStorage only. Mobile phase 11 folds
 * them into this hook so the pages are shells and the behaviour is one.
 *
 * Returns { tokePrefs, menuHandlers }. `menuHandlers` is the third argument
 * `getMenuConfig('toke-tracker', user, tokePrefs, menuHandlers)` expects.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'toke-tracker-prefs';
const SYNC_EVENT = 'toke-settings-sync';

export const DEFAULT_TOKE_PREFS = {
    shiftNotifications: true,
    autoSaveShifts: true,
    downTimerAlerts: true,
};

export function useTokePrefs(userId) {
    const [tokePrefs, setTokePrefs] = useState(DEFAULT_TOKE_PREFS);

    // Client-only hydration: localStorage first (instant), then the profile row.
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) setTokePrefs((prev) => ({ ...prev, ...JSON.parse(stored) }));
        } catch (e) { console.warn('[TokeTracker] prefs read failed:', e?.message || e); }
    }, []);

    useEffect(() => {
        if (!userId) return;
        supabase.from('profiles').select('settings').eq('id', userId).maybeSingle()
            .then(({ data }) => {
                if (data?.settings?.tokeTracker) {
                    setTokePrefs((prev) => ({ ...prev, ...data.settings.tokeTracker }));
                }
            })
            .catch((e) => console.warn('[TokeTracker] prefs load failed:', e?.message || e));
    }, [userId]);

    // Cross-tab sync.
    useEffect(() => {
        const handler = (e) => { if (e.detail) setTokePrefs(e.detail); };
        window.addEventListener(SYNC_EVENT, handler);
        return () => window.removeEventListener(SYNC_EVENT, handler);
    }, []);

    const updatePref = useCallback(async (key, value) => {
        let next;
        setTokePrefs((prev) => { next = { ...prev, [key]: value }; return next; });
        await new Promise((r) => setTimeout(r, 0));
        if (!next) return;
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) { console.warn('[TokeTracker] prefs write failed:', e?.message || e); }
        if (!userId) return;
        try {
            const { data: profile } = await supabase.from('profiles').select('settings').eq('id', userId).maybeSingle();
            const settings = profile?.settings || {};
            settings.tokeTracker = next;
            const { error } = await supabase.from('profiles').update({ settings }).eq('id', userId);
            if (error) console.warn('[Supabase] Silent mutation failed in profiles:', error.message);
        } catch (err) {
            console.warn('[TokeTracker] Failed to save preference:', err?.message || err);
        }
    }, [userId]);

    const menuHandlers = useMemo(() => ({
        setShiftNotifications: (v) => updatePref('shiftNotifications', v),
        setAutoSaveShifts: (v) => updatePref('autoSaveShifts', v),
        setDownTimerAlerts: (v) => updatePref('downTimerAlerts', v),
    }), [updatePref]);

    return { tokePrefs, updatePref, menuHandlers };
}

export default useTokePrefs;
