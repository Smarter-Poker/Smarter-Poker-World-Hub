<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getAuthUser, getAccessToken } from '../lib/authUtils';
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes
=======
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
            const user = getAuthUser();
            if (!user) {
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
=======
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
>>>>>>> Stashed changes
                setLoading(false);
                return;
            }
            if (globalTrackedTours === null) {
                try {
                    const { data } = await supabase
                        .from('user_notification_preferences')
                        .select('tracked_tours')
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
                        .eq('user_id', user.id)
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
=======
                        .eq('user_id', session.user.id)
>>>>>>> Stashed changes
                        .maybeSingle();

                    if (isMounted) {
                        globalTrackedTours = data?.tracked_tours || [];
                        setTrackedTours(globalTrackedTours);
                        emitChange();
                    }
                } catch (e) {
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
                    console.error('Failed to fetch tracked tours:', e);
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
=======
                    console.error('Failed to fetch tracked tours', e);
>>>>>>> Stashed changes
                }
            } else {
                setTrackedTours(globalTrackedTours);
            }
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
            if (isMounted) setLoading(false);
=======
            setLoading(false);
>>>>>>> Stashed changes
=======
            setLoading(false);
>>>>>>> Stashed changes
=======
            setLoading(false);
>>>>>>> Stashed changes
=======
            setLoading(false);
>>>>>>> Stashed changes
=======
            setLoading(false);
>>>>>>> Stashed changes
=======
            setLoading(false);
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    // [UT2 FIX] Lock ref prevents concurrent toggles from reading stale closure state.
    // Without this, rapid double-click reads the same `trackedTours` snapshot for both clicks,
    // causing duplicate entries in the optimistic state.
    const toggleLockRef = useRef(false);

    const toggleTrackTour = useCallback(async (tourCode) => {
        if (toggleLockRef.current) return; // Prevent concurrent toggles
        toggleLockRef.current = true;

        const user = getAuthUser();
        const token = getAccessToken();
        if (!user || !token) {
            toggleLockRef.current = false;
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
=======
    const toggleTrackTour = useCallback(async (tourCode) => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
=======
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
<<<<<<< Updated upstream
        } finally {
            toggleLockRef.current = false;
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
        }
    }, [trackedTours]);

    const isTracking = useCallback((tourCode) => trackedTours.includes(tourCode), [trackedTours]);

    return { trackedTours, toggleTrackTour, isTracking, loading };
}
