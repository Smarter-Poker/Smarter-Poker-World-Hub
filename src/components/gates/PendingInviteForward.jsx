/**
 * PENDING INVITE FORWARD (Share & Invite, 2026-10-15)
 * A signed-in player whose account still owes a visit to an invited club's
 * join page (fn_club_invite_pending) is sent there from the hub, once per
 * browser session. Once signed in, the session flag is set BEFORE the lookup,
 * so the hub asks at most once a session even when nothing is pending.
 * Renders nothing.
 */
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { fetchPendingJoinPath } from '../../lib/clubInvite';

export const PENDING_INVITE_FORWARDED_KEY = 'sp-pending-invite-forwarded';

export default function PendingInviteForward({ enabled = true }) {
    useEffect(() => {
        if (!enabled) return undefined;
        try {
            if (sessionStorage.getItem(PENDING_INVITE_FORWARDED_KEY) === '1') return undefined;
        } catch (_e) {
            return undefined; // no session storage: never risk a forward on every visit
        }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase.auth.getSession();
                const token = data?.session?.access_token;
                if (!token || cancelled) return;
                // Signed in: spend this session's one look before asking.
                sessionStorage.setItem(PENDING_INVITE_FORWARDED_KEY, '1');
                const path = await fetchPendingJoinPath(token);
                if (!cancelled && path) window.location.assign(path);
            } catch (_e) { /* never block the hub on this */ }
        })();
        return () => { cancelled = true; };
    }, [enabled]);
    return null;
}
