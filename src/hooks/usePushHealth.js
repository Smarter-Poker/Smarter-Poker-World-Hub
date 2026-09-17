import { useEffect, useState } from 'react';
import { getAuthUser, getAccessToken } from '../lib/authUtils';
import { supabase } from '../lib/supabase';
import { isPushHealthSnapshot } from '../lib/pushHealthSnapshot.mjs';

export default function usePushHealth() {
    const [state, setState] = useState({ userId: null, data: null, error: null });
    useEffect(() => {
        let live = true;
        let generation = 0;
        let currentUserId;
        const load = (userId, token) => {
            if (userId === currentUserId) return;
            currentUserId = userId;
            const ticket = ++generation;
            setState({ userId, data: null, error: userId ? null : 'Not Authenticated' });
            if (!userId) return;
            const current = () => live && ticket === generation && getAuthUser()?.id === userId;
            (async () => {
                try {
                    const response = await fetch('/api/admin/push-health-data', {
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    const data = await response.json();
                    if (!current()) return;
                    if (!response.ok || !isPushHealthSnapshot(data)
                        || typeof data.config?.configured !== 'boolean' || typeof data.config?.keyMatches !== 'boolean') {
                        setState({ userId, data: null, error: response.status === 403 ? 'Admin Required' : 'Push Health Is Unavailable. Please Try Again.' });
                        return;
                    }
                    setState({ userId, data, error: null });
                } catch {
                    if (current()) setState({ userId, data: null, error: 'Push Health Is Unavailable. Please Try Again.' });
                }
            })();
        };
        const sync = () => load(getAuthUser()?.id || null, getAccessToken());
        const onStorage = event => {
            if (!event.key || event.key === 'smarter-poker-auth' || (event.key.startsWith('sb-') && event.key.endsWith('-auth-token'))) sync();
        };
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') load(null, null);
            else load(session?.user?.id || getAuthUser()?.id || null, session?.access_token || getAccessToken());
        });
        window.addEventListener('storage', onStorage);
        sync();
        return () => {
            live = false;
            generation += 1;
            listener?.subscription?.unsubscribe();
            window.removeEventListener('storage', onStorage);
        };
    }, []);
    // An account change hides private metrics in the first render, even before
    // the auth listener's next callback or an in-flight request completes.
    const sameUser = state.userId === (getAuthUser()?.id || null);
    return { data: sameUser ? state.data : null, error: sameUser ? state.error : null };
}
