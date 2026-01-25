/**
 * GLOBAL NOTIFICATION PROMPT — Wraps NotificationPrompt with auth check
 * Automatically shows push notification prompt after user logs in
 */
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import NotificationPrompt from '../notifications/NotificationPrompt';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { storageKey: 'smarter-poker-auth', persistSession: true } }
);

export default function GlobalNotificationPrompt() {
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        // Check current user on mount
        const checkUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
            }
        };
        checkUser();

        // Listen for auth changes
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
