/**
 * GLOBAL NOTIFICATION PROMPT -- auth-aware mount point for the push stack.
 *
 * Rewired 2026-08-19 from OneSignal to the self-hosted VAPID stack. Mounts two
 * things for every signed-in user, on every route:
 *
 *   FirstRunNotificationPrompt -- asks once per account per browser
 *   PushSubscriptionSync       -- silently repairs a rotated subscription
 *
 * STAFF SURFACES ARE EXEMPT FROM THE PROMPT (2026-08-26). It is a modal with
 * `aria-modal` and a backdrop, and it mounts on EVERY route, so on /horses it
 * appeared over the admin console and intercepted every click until dismissed.
 * Found by walking the panel in a real browser: it interrupted the walk part
 * way through, which is worse than appearing at load -- an operator gets it
 * mid-task, over whatever they were doing.
 *
 * It is also simply the wrong ask. This prompt exists to sign a PLAYER up for
 * push about their games. Nothing on the staff consoles sends to it.
 *
 * PushSubscriptionSync still mounts everywhere: it renders nothing, takes no
 * input, and only repairs a rotated subscription. Suppressing it on these
 * routes would let a staff member's own player device go silent just because
 * of where they happened to be browsing.
 *
 * PushSubscriptionSync is the important one. Without it, a subscription that
 * the browser rotates in the background is never re-registered, the first-run
 * prompt has already been marked done forever, and that device goes silent
 * permanently while the server keeps reporting successful sends.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { getAuthUser } from '../../lib/authUtils';
import FirstRunNotificationPrompt from '../notifications/FirstRunNotificationPrompt';
import PushSubscriptionSync from '../notifications/PushSubscriptionSync';

/**
 * Routes that belong to staff tooling rather than the product. Prefix match,
 * so /horses covers /horses/sql-console, /horses/hg-moderation and the rest.
 */
const STAFF_ROUTE_PREFIXES = ['/horses', '/commander', '/admin'];

function isStaffRoute(pathname) {
    if (!pathname) return false;
    return STAFF_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function GlobalNotificationPrompt() {
    const router = useRouter();
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

    // router.pathname is the matched route, so a dynamic segment cannot dodge
    // the prefix check.
    const staff = isStaffRoute(router?.pathname);

    return (
        <>
            <PushSubscriptionSync />
            {!staff && <FirstRunNotificationPrompt userId={userId} />}
        </>
    );
}
