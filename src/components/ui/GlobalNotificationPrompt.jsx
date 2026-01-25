/**
 * GLOBAL NOTIFICATION PROMPT — Wraps NotificationPrompt with auth check
 * Automatically shows push notification prompt after user logs in
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import NotificationPrompt from '../notifications/NotificationPrompt';

export default function GlobalNotificationPrompt() {
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        // 🛡️ BULLETPROOF: Use authUtils to avoid AbortError
        const user = getAuthUser();
        if (user) {
            setUserId(user.id);
        }

        // Listen for auth changes (this is safe - event-based)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session?.user) {
                setUserId(session.user.id);
            } else {
                setUserId(null);
            }
        });

        return () => subscription?.unsubscribe();
    }, []);

    // Only show prompt if user is logged in
    if (!userId) return null;

    return <NotificationPrompt userId={userId} />;
}

