/**
 * GLOBAL NOTIFICATION PROMPT -- auth-aware mount point for the push stack.
 *
 * Rewired 2026-08-19 from OneSignal to the self-hosted VAPID stack. Mounts two
 * things for every signed-in user, on every route:
 *
 *   FirstRunNotificationPrompt -- asks once per account per browser
 *   PushSubscriptionSync       -- silently repairs a rotated subscription
 *
 * PushSubscriptionSync is the important one. Without it, a subscription that
 * the browser rotates in the background is never re-registered, the first-run
 * prompt has already been marked done forever, and that device goes silent
 * permanently while the server keeps reporting successful sends.
 */
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import FirstRunNotificationPrompt from '../notifications/FirstRunNotificationPrompt';
import PushSubscriptionSync from '../notifications/PushSubscriptionSync';

export default function GlobalNotificationPrompt() {
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        // Read from the auth cache first to avoid the Supabase locks AbortError.
        const user = getAuthUser();
        if (user) setUserId(user.id);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setUserId(session?.user?.id || null);
        });

        return () => subscription?.unsubscribe();
    }, []);

    if (!userId) return null;

    return (
        <>
            <PushSubscriptionSync />
            <FirstRunNotificationPrompt userId={userId} />
        </>
    );
}
