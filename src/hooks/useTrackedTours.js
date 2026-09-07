import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser, getAccessToken } from '../lib/authUtils';

// Global memory cache so we don't spam the DB
let globalTrackedTours = null;
let listeners = new Set();

const emitChange = () => {
    listeners.forEach(fn => fn(globalTrackedTours));
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('poker_tours_updated', { detail: globalTrackedTours }));
    }
};

export default function useTrackedTours() {
    const [trackedTours, setTrackedTours] = useState(globalTrackedTours || []);
    const [loading, setLoading] = useState(true);
    const [actionNotice, setActionNotice] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const fetchPrefs = async () => {
            const user = getAuthUser();
            if (!user) {
                setLoading(false);
                return;
            }
            if (globalTrackedTours === null) {
                try {
                    const { data, error } = await supabase
                        .from('user_notification_preferences')
                        .select('tracked_tours')
                        .eq('user_id', user.id)
                        .maybeSingle();
                    if (error) throw error;

                    if (isMounted) {
                        globalTrackedTours = data?.tracked_tours || [];
                        setTrackedTours(globalTrackedTours);
                        emitChange();
                    }
                } catch (e) {
                    console.warn('Failed to fetch tracked tours:', e);
                    if (isMounted) setTrackedTours(globalTrackedTours || []);
                }
            } else {
                setTrackedTours(globalTrackedTours);
            }
            if (isMounted) setLoading(false);
        };
        fetchPrefs();

        const handler = (tours) => setTrackedTours(tours);
        listeners.add(handler);

        const onWindowUpdate = (e) => {
            if (e.detail && Array.isArray(e.detail)) {
                globalTrackedTours = e.detail;
                setTrackedTours(e.detail);
            }
        };
        window.addEventListener('poker_tours_updated', onWindowUpdate);

        return () => {
            isMounted = false;
            listeners.delete(handler);
            window.removeEventListener('poker_tours_updated', onWindowUpdate);
        };
    }, []);

    // Lock ref prevents concurrent toggles from reading stale closure state.
    const toggleLockRef = useRef(false);

    const toggleTrackTour = useCallback(async (tourCode) => {
        if (toggleLockRef.current) return; // Prevent concurrent toggles
        toggleLockRef.current = true;

        const user = getAuthUser();
        const token = getAccessToken();
        if (!user || !token) {
            toggleLockRef.current = false;
            setActionNotice({
                kind: 'auth',
                title: 'Sign In To Track Tours',
                message: 'Tour alerts are saved to your Smarter.Poker account so they stay available across devices.',
            });
            return;
        }

        const currentlyTracking = trackedTours.includes(tourCode);
        const optimistic = currentlyTracking
            ? trackedTours.filter(t => t !== tourCode)
            : [...trackedTours, tourCode];

        globalTrackedTours = optimistic;
        setTrackedTours(optimistic);
        emitChange();

        try {
            const res = await fetch('/api/notifications/track-tour', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ tour: tourCode })
            });
            const json = await res.json();
            if (json.success) {
                globalTrackedTours = json.tracked_tours || [];
                setTrackedTours(globalTrackedTours);
                emitChange();
            } else {
                console.warn('Failed to save tracked tour:', json.error);
                globalTrackedTours = trackedTours;
                setTrackedTours(trackedTours);
                emitChange();
                setActionNotice({
                    kind: 'error',
                    title: 'Tracking Could Not Be Saved',
                    message: 'Your previous setting was restored. Check your connection and try again.',
                });
            }
        } catch (e) {
            console.warn(e);
            globalTrackedTours = trackedTours;
            setTrackedTours(trackedTours);
            emitChange();
            setActionNotice({
                kind: 'error',
                title: 'Network Connection Interrupted',
                message: 'Your previous setting was restored. Reconnect, then try tracking this tour again.',
            });
        } finally {
            toggleLockRef.current = false;
        }
    }, [trackedTours]);

    const isTracking = useCallback((tourCode) => trackedTours.includes(tourCode), [trackedTours]);
    const clearActionNotice = useCallback(() => setActionNotice(null), []);

    return {
        trackedTours,
        toggleTrackTour,
        isTracking,
        loading,
        actionNotice,
        clearActionNotice,
    };
}
