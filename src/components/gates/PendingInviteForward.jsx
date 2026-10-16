/**
 * PENDING INVITE FORWARD (Share & Invite, 2026-10-15)
 * A signed-in player whose account still owes a visit to an invited club's
 * join page (fn_club_invite_pending) is sent there from the hub, once per
 * browser session. The flag is shared with Club Arena's forwarder on the same
 * origin (any value means a forward was already considered this session), and
 * it is only spent on a real answer: a failed lookup tries again next visit.
 * Renders nothing.
 */
import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { lookupPendingJoinPath } from '../../lib/clubInvite';

export const PENDING_INVITE_FORWARDED_KEY = 'sp-pending-invite-forwarded';

export default function PendingInviteForward({ enabled = true }) {
    useEffect(() => {
        if (!enabled) return undefined;
        try {
            if (sessionStorage.getItem(PENDING_INVITE_FORWARDED_KEY)) return undefined;
        } catch (_e) {
            return undefined; // no session storage: never risk a forward on every visit
        }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase.auth.getSession();
                const token = data?.session?.access_token;
                if (!token || cancelled) return;
                const path = await lookupPendingJoinPath(token);
                if (path === undefined || cancelled) return; // could not ask: try next visit
                sessionStorage.setItem(PENDING_INVITE_FORWARDED_KEY, '1');
                if (path) window.location.assign(path);
            } catch (_e) { /* never block the hub on this */ }
        })();
        return () => { cancelled = true; };
    }, [enabled]);
    return null;
}
