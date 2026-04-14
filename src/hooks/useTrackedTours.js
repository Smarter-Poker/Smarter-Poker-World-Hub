import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser, getAccessToken, getAuthUserId } from '../lib/authUtils';

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
                    const { data } = await supabase
                        .from('user_notification_preferences')
                        .select('tracked_tours')
                        .eq('user_id', user.id)
                        .maybeSingle();

                    if (isMounted) {
                        globalTrackedTours = data?.tracked_tours || [];
                        setTrackedTours(globalTrackedTours);
                        emitChange();
                    }
                } catch (e) {
                    console.error('Failed to fetch tracked tours', e);
                }
            } else {
                setTrackedTours(globalTrackedTours);
            }
            setLoading(false);
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

    const toggleTrackTour = useCallback(async (tourCode) => {
        const user = getAuthUser();
        const token = getAccessToken();
        if (!user || !token) {
            alert('Please sign in to track tours.');
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
                console.error('Failed to save tracked tour:', json.error);
                // Revert
                globalTrackedTours = trackedTours;
                setTrackedTours(trackedTours);
                emitChange();
                alert('We had trouble saving your preference. Please try again.');
            }
        } catch (e) {
            console.error(e);
            globalTrackedTours = trackedTours;
            setTrackedTours(trackedTours);
            emitChange();
            alert('A network error occurred.');
        }
    }, [trackedTours]);

    const isTracking = useCallback((tourCode) => trackedTours.includes(tourCode), [trackedTours]);

    return { trackedTours, toggleTrackTour, isTracking, loading };
}
