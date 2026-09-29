/**
 * SocialLayer.jsx — Feature #4: Social Layer: See Friends At Venues
 * Shows friends checked in at venues with geofence integration.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFreshAccessToken } from '../../lib/authUtils';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

// Friend check-ins older than this are history, not "at the venue right now".
const CHECKIN_WINDOW_MS = 24 * 60 * 60 * 1000;

function timeAgo(dateStr) {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.floor((now - then) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// Generate a deterministic color from a string
function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 55%)`;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function SocialLayer({ userId, userLocation, venues = [], authToken, requireOnline }) {
    const [friendCheckins, setFriendCheckins] = useState([]);
    const [friendsList, setFriendsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteModal, setInviteModal] = useState(null);
    const [inviteCopied, setInviteCopied] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const abortRef = useRef(null);
    // BUG FIX: fetchFriendCheckins used to reuse fetchFriends' controller, so a
    // re-run of fetchFriends aborted the in-flight check-in requests and the venue
    // map silently collapsed to empty. Each request group now owns its controller.
    const checkinsAbortRef = useRef(null);
    const isMounted = useRef(true);

    // WIRING FIX: the lobby call site renders <SocialLayer> with no authToken prop, so
    // every request here ran unauthenticated — and /api/poker/checkins requires a Bearer
    // token on both the friends branch and the user_id branch. Fall back to the client's
    // own session token (getFreshAccessToken) when the prop is absent.
    const [resolvedToken, setResolvedToken] = useState(authToken || null);
    useEffect(() => {
        let cancelled = false;
        if (authToken) {
            setResolvedToken(authToken);
            return () => { cancelled = true; };
        }
        if (!userId) return undefined;
        (async () => {
            try {
                const token = await getFreshAccessToken();
                if (!cancelled && token) setResolvedToken(token);
            } catch (err) {
                console.warn('[SocialLayer] Could not resolve access token:', err?.message || err);
            }
        })();
        return () => { cancelled = true; };
    }, [authToken, userId]);

    const authHeaders = useCallback(
        () => (resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
        [resolvedToken]
    );

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (abortRef.current) abortRef.current.abort();
            if (checkinsAbortRef.current) checkinsAbortRef.current.abort();
        };
    }, []);

    // Fetch friends list
    const fetchFriends = useCallback(async () => {
        if (abortRef.current) abortRef.current.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        const signal = ac.signal;

        if (!userId) {
            setLoading(false);
            return;
        }
        try {
            const headers = authHeaders();
            // WIRING FIX: '/api/friends/list' has no handler (verified against the full
            // repo — only pages/api/friends/index.js exists), so this 404'd on every load
            // and the Friends feed was permanently empty. The real contract is
            // GET /api/friends?action=list, which derives identity from the JWT (not a
            // query param) and answers { success, data: { friends: [...] } }.
            const res = await fetch('/api/friends?action=list', { headers, signal });
            if (!res.ok) {
                // 401 when signed out, or user has no friends — show empty state
                setLoading(false);
                return;
            }
            const data = await res.json();
            if (!isMounted.current) return;
            setFriendsList(data?.data?.friends || data?.friends || (Array.isArray(data?.data) ? data.data : []));
            // BUG FIX: loading was only cleared on !res.ok or catch. A successful
            // response with zero friends left the spinner ("Finding friends...") up
            // forever, because the effect below skips fetchFriendCheckins — the only
            // other success-path setLoading(false) — when the list is empty.
            setLoading(false);
        } catch (err) {
            if (!isMounted.current) return;
            console.warn('Failed to fetch friends:', err);
            setLoading(false);
        }
    }, [userId, authHeaders]);

    // Fetch recent check-ins from friends
    const fetchFriendCheckins = useCallback(async () => {
        if (!userId) return;
        if (checkinsAbortRef.current) checkinsAbortRef.current.abort();
        const checkinsController = new AbortController();
        checkinsAbortRef.current = checkinsController;
        try {
            // Get all recent checkins and filter to friends
            const friendIds = friendsList.map(f => f.friend_id || f.id);
            if (friendIds.length === 0) {
                setFriendCheckins([]);
                setLoading(false);
                return;
            }

            // Batch fetch checkins for each friend (last 24h).
            // BUG FIX 1: the request carried no time bound, so a friend's ENTIRE
            // check-in history came back and every row was rendered with a green
            // "online" dot and counted in the "N active" badge — a check-in from
            // three weeks ago looked like the friend was at the venue right now.
            // BUG FIX 2: this was a serial await loop (up to 50 sequential round
            // trips); NearMeNowFeed already uses Promise.allSettled for the same job.
            const cutoffMs = Date.now() - CHECKIN_WINDOW_MS;
            const since = new Date(cutoffMs).toISOString();
            // WIRING FIX 3: these requests carried NO Authorization header, but
            // /api/poker/checkins hard-requires a Bearer token on the user_id branch
            // (it is a physical location log). Every call 401'd, the 401 was swallowed
            // by the `r.ok ? ... : { checkins: [] }` fallback, and "Friends at Venues"
            // rendered its empty state even when friends were checked in.
            const headers = authHeaders();
            const targets = friendIds.slice(0, 50);
            const results = await Promise.allSettled(
                targets.map(fid =>
                    fetch(`/api/poker/checkins?user_id=${fid}&since=${encodeURIComponent(since)}`, {
                        headers,
                        signal: checkinsController.signal,
                    })
                        .then(r => (r.ok ? r.json() : { checkins: [] }))
                        .then(data => ({ fid, checkins: data.checkins || [] }))
                        .catch(() => ({ fid, checkins: [] }))
                )
            );
            if (!isMounted.current || checkinsController.signal.aborted) return;

            const allCheckins = [];
            results.forEach(result => {
                if (result.status !== 'fulfilled') return;
                const { fid, checkins } = result.value;
                checkins.forEach(c => {
                    // The API ignores `since` on the user_id branch, so enforce the
                    // 24h window client-side too.
                    const ts = c.created_at ? new Date(c.created_at).getTime() : NaN;
                    if (isNaN(ts) || ts < cutoffMs) return;
                    allCheckins.push({
                        ...c,
                        friend: friendsList.find(f => (f.friend_id || f.id) === fid),
                    });
                });
            });

            // Sort by most recent
            allCheckins.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            // Aggregate by venue
            const venueMap = {};
            allCheckins.forEach(c => {
                const vid = c.venue_id;
                if (!venueMap[vid]) {
                    const venue = venues.find(v => String(v.id) === String(vid));
                    venueMap[vid] = {
                        venue_id: vid,
                        venue_name: venue?.name || `Venue #${vid}`,
                        venue_city: venue?.city || '',
                        venue_state: venue?.state || '',
                        checkins: [],
                    };
                }
                venueMap[vid].checkins.push(c);
            });

            if (!isMounted.current || checkinsController.signal.aborted) return;
            setFriendCheckins(Object.values(venueMap || {}));
        } catch (err) {
            if (!isMounted.current) return;
            console.warn('Failed to fetch friend checkins:', err);
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [userId, friendsList, venues, authHeaders]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    useEffect(() => {
        if (friendsList.length > 0) {
            fetchFriendCheckins();
        }
        // Auto-refresh stays disabled per product decision; the header Refresh button
        // below replaces it (the old setInterval/clearInterval pair was dead code).
    }, [friendsList, fetchFriendCheckins]);

    // A11Y: the invite modal had no dialog role, no Escape handler and no focus move,
    // so keyboard and screen-reader users tabbed straight past it into the page behind.
    const inviteModalRef = useRef(null);
    // Mobile phase 3: back gesture closes the invite sheet; a drag that merely
    // ends on the scrim does not.
    const closeInvite = useCallback(() => setInviteModal(null), []);
    useModalHistory(!!inviteModal, closeInvite);
    const inviteScrim = useScrimDismiss(closeInvite);
    const inviteOpenerRef = useRef(null);
    useEffect(() => {
        if (!inviteModal) return undefined;
        if (typeof document === 'undefined') return undefined;
        inviteOpenerRef.current = document.activeElement;
        if (inviteModalRef.current) {
            try { inviteModalRef.current.focus(); } catch { /* focus not supported */ }
        }
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setInviteModal(null);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = prevOverflow;
            const opener = inviteOpenerRef.current;
            if (opener && typeof opener.focus === 'function') {
                try { opener.focus(); } catch { /* element gone */ }
            }
        };
    }, [inviteModal]);

    const handleManualRefresh = useCallback(() => {
        if (refreshing) return;
        setRefreshing(true);
        fetchFriendCheckins();
    }, [refreshing, fetchFriendCheckins]);

    // Generate invite link
    const generateInviteLink = (venueId) => {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        return `${base}/hub/venues/${venueId}?action=checkin&inviter=${userId}`;
    };

    const copyInviteLink = async (venueId) => {
        if (typeof requireOnline === 'function' && !requireOnline()) return;
        const link = generateInviteLink(venueId);
        try {
            await navigator.clipboard.writeText(link);
            setInviteCopied(true);
            setTimeout(() => setInviteCopied(false), 2000);
        } catch {
            // Fallback
            const ta = document.createElement('textarea');
            ta.value = link;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setInviteCopied(true);
            setTimeout(() => setInviteCopied(false), 2000);
        }
    };

    const totalFriendsActive = friendCheckins.reduce((sum, vc) => sum + vc.checkins.length, 0);

    return (
        <PokerNearMePanelShell
            as="section"
            className="social-layer pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-social-layer-title"
        >
            <div className="sl-header">
                <PokerNearMeConsoleIcon name="home" className="pnm-console-tool__header-icon" />
                <h2 id="pnm-social-layer-title">Friends At Venues</h2>
                {totalFriendsActive > 0 && (
                    <span className="sl-badge">{totalFriendsActive} Active</span>
                )}
                {userId && friendsList.length > 0 && (
                    <button
                        type="button"
                        className="sl-refresh-btn"
                        onClick={handleManualRefresh}
                        disabled={refreshing}
                        title="Refresh friend check-ins"
                    >
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                )}
            </div>

            {!userId && (
                <div className="sl-login-prompt">
                    <PokerNearMeConsoleIcon name="home" className="pnm-console-tool__state-icon" />
                    <p>Sign In To See Your Friends At Poker Venues</p>
                </div>
            )}

            {userId && loading && (
                <div className="sl-loading">
                    <div className="sl-spinner" />
                    <span>Finding Friends...</span>
                </div>
            )}

            {userId && !loading && friendCheckins.length === 0 && (
                <div className="sl-empty">
                    <div className="sl-empty-icon">
                        <PokerNearMeConsoleIcon name="home" className="pnm-console-tool__state-icon" />
                    </div>
                    <p className="sl-empty-title">No Friends Checked In</p>
                    <p className="sl-empty-copy">
                        {friendsList.length === 0
                            ? 'Add friends to see when they visit poker rooms!'
                            : `None of your ${friendsList.length} friends are checked in right now`}
                    </p>
                    <div className="sl-empty-ctas">
                        <button type="button" className="sl-cta-btn sl-cta-checkin" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/hub/poker-near-me/venues'; }}>
                            <PokerNearMeConsoleIcon name="location" />
                            Check In At A Venue
                        </button>
                        <button type="button" className="sl-cta-btn sl-cta-invite" onClick={() => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title: 'Join me on Smarter.Poker', url: typeof window !== 'undefined' ? window.location.origin : '' }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); }}>
                            <PokerNearMeConsoleIcon name="share" />
                            Invite Friends
                        </button>
                    </div>
                </div>
            )}

            {userId && !loading && friendCheckins.length > 0 && (
                <div className="sl-venue-list">
                    {friendCheckins.map((vc, i) => (
                        <div key={i} className="sl-venue-group">
                            <div className="sl-venue-header">
                                <div className="sl-venue-info">
                                    <div className="sl-venue-name">{vc.venue_name}</div>
                                    <div className="sl-venue-loc">{vc.venue_city}{vc.venue_state ? `, ${vc.venue_state}` : ''}</div>
                                </div>
                                <div className="sl-venue-count">
                                    <PokerNearMeConsoleIcon name="home" />
                                    {vc.checkins.length}
                                </div>
                            </div>

                            <div className="sl-friend-list">
                                {vc.checkins.map((c, ci) => {
                                    const name = c.user_name || c.friend?.display_name || 'Player';
                                    return (
                                        <div key={ci} className="sl-friend-card">
                                            <div className="sl-avatar" style={{ background: stringToColor(name) }}>
                                                {getInitials(name)}
                                            </div>
                                            <div className="sl-friend-info">
                                                <div className="sl-friend-name">{name}</div>
                                                <div className="sl-friend-time">
                                                    <span className="sl-online-dot" />
                                                    Checked In {timeAgo(c.created_at)}
                                                    {c.message && <span className="sl-friend-msg"> - "{c.message}"</span>}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="sl-invite-btn"
                                                onClick={() => setInviteModal({ venueId: vc.venue_id, venueName: vc.venue_name, friendName: name })}
                                            >
                                                <PokerNearMeConsoleIcon name="share" />
                                                Invite
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Invite Modal */}
            {inviteModal && (
                <div className="sl-modal-overlay" role="presentation" {...inviteScrim}>
                    <PokerNearMePanelShell
                        as="div"
                        className="sl-modal pnm-console-tool-subpanel"
                        bodyClassName="sl-modal__body"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Invite a friend to ${inviteModal.venueName}`}
                        tabIndex={-1}
                        surfaceRef={inviteModalRef}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="sl-modal-header">
                            <h3>Invite To Table</h3>
                            <button type="button" className="sl-modal-close" aria-label="Close" onClick={closeInvite}>
                                <PokerNearMeConsoleIcon name="close" />
                            </button>
                        </div>
                        <p className="sl-modal-text">
                            Share This Link To Invite Someone To Join You At <strong>{inviteModal.venueName}</strong>:
                        </p>
                        <div className="sl-invite-link-box">
                            <input type="text" value={generateInviteLink(inviteModal.venueId)} readOnly className="sl-invite-link-input" />
                            <button type="button" className="sl-copy-btn" onClick={() => copyInviteLink(inviteModal.venueId)}>
                                {inviteCopied ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>
                    </PokerNearMePanelShell>
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
