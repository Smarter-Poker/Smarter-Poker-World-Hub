/**
 * SocialLayer.jsx — Feature #4: Social Layer: See Friends At Venues
 * Shows friends checked in at venues with geofence integration.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 60000; // 1 minute
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

export default function SocialLayer({ userId, userLocation, venues = [], authToken }) {
    const [friendCheckins, setFriendCheckins] = useState([]);
    const [friendsList, setFriendsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteModal, setInviteModal] = useState(null);
    const [inviteCopied, setInviteCopied] = useState(false);
    const refreshRef = useRef(null);
    const abortRef = useRef(null);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (abortRef.current) abortRef.current.abort();
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
            const headers = {};
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            const res = await fetch(`/api/friends/list?user_id=${userId}`, { headers, signal });
            if (!res.ok) {
                // API may not exist yet or user has no friends — show empty state
                setLoading(false);
                return;
            }
            const data = await res.json();
            if (!isMounted.current) return;
            setFriendsList(data.friends || data.data || []);
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
    }, [userId, authToken]);

    // Fetch recent check-ins from friends
    const fetchFriendCheckins = useCallback(async () => {
        if (!userId) return;
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
            const targets = friendIds.slice(0, 50);
            const results = await Promise.allSettled(
                targets.map(fid =>
                    fetch(`/api/poker/checkins?user_id=${fid}&since=${encodeURIComponent(since)}`, { signal: abortRef.current?.signal })
                        .then(r => (r.ok ? r.json() : { checkins: [] }))
                        .then(data => ({ fid, checkins: data.checkins || [] }))
                        .catch(() => ({ fid, checkins: [] }))
                )
            );
            if (!isMounted.current) return;

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

            if (!isMounted.current) return;
            setFriendCheckins(Object.values(venueMap || {}));
        } catch (err) {
            if (!isMounted.current) return;
            console.warn('Failed to fetch friend checkins:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [userId, friendsList, venues]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    useEffect(() => {
        if (friendsList.length > 0) {
            fetchFriendCheckins();
            // Disabled auto-refresh per user request!
            // refreshRef.current = setInterval(fetchFriendCheckins, REFRESH_INTERVAL);
        }
        return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
    }, [friendsList, fetchFriendCheckins]);

    // Generate invite link
    const generateInviteLink = (venueId) => {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        return `${base}/hub/venues/${venueId}?action=checkin&inviter=${userId}`;
    };

    const copyInviteLink = async (venueId) => {
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
        <div className="social-layer">
            <div className="sl-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87" />
                    <path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                <h2>Friends at Venues</h2>
                {totalFriendsActive > 0 && (
                    <span className="sl-badge">{totalFriendsActive} active</span>
                )}
            </div>

            {!userId && (
                <div className="sl-login-prompt">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                    </svg>
                    <p>Sign in to see your friends at poker venues</p>
                </div>
            )}

            {userId && loading && (
                <div className="sl-loading">
                    <div className="sl-spinner" />
                    <span>Finding friends...</span>
                </div>
            )}

            {userId && !loading && friendCheckins.length === 0 && (
                <div className="sl-empty">
                    <div className="sl-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
                            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                        </svg>
                    </div>
                    <p style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>No Friends Checked In</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                        {friendsList.length === 0
                            ? 'Add friends to see when they visit poker rooms!'
                            : `None of your ${friendsList.length} friends are checked in right now`}
                    </p>
                    <div className="sl-empty-ctas">
                        <button className="sl-cta-btn sl-cta-checkin" onClick={() => { if (typeof window !== 'undefined') window.location.href = '/hub/poker-near-me/venues'; }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Check In at a Venue
                        </button>
                        <button className="sl-cta-btn sl-cta-invite" onClick={() => { if (typeof navigator !== 'undefined' && navigator.share) navigator.share({ title: 'Join me on Smarter.Poker', url: typeof window !== 'undefined' ? window.location.origin : '' }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e)); }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
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
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                                        <circle cx="9" cy="7" r="4" />
                                    </svg>
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
                                                    Checked in {timeAgo(c.created_at)}
                                                    {c.message && <span className="sl-friend-msg"> — "{c.message}"</span>}
                                                </div>
                                            </div>
                                            <button
                                                className="sl-invite-btn"
                                                onClick={() => setInviteModal({ venueId: vc.venue_id, venueName: vc.venue_name, friendName: name })}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
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
                <div className="sl-modal-overlay" onClick={() => setInviteModal(null)}>
                    <div className="sl-modal" onClick={e => e.stopPropagation()}>
                        <div className="sl-modal-header">
                            <h3>Invite to Table</h3>
                            <button className="sl-modal-close" onClick={() => setInviteModal(null)}>×</button>
                        </div>
                        <p className="sl-modal-text">
                            Share this link to invite someone to join you at <strong>{inviteModal.venueName}</strong>:
                        </p>
                        <div className="sl-invite-link-box">
                            <input type="text" value={generateInviteLink(inviteModal.venueId)} readOnly className="sl-invite-link-input" />
                            <button className="sl-copy-btn" onClick={() => copyInviteLink(inviteModal.venueId)}>
                                {inviteCopied ? '✓ Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .social-layer { padding: 0 0 20px; }
        .sl-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .sl-header h2 { font-size: 22px; font-weight: 700; color: #e2e8f0; margin: 0; flex: 1; letter-spacing: -0.3px; }
        .sl-badge { padding: 4px 12px; border-radius: 20px; background: rgba(34,197,94,0.15); border: 1.5px solid rgba(34,197,94,0.3); color: #22c55e; font-size: 12px; font-weight: 600; box-shadow: inset 0 1px 0 rgba(34,197,94,0.1); }
        .sl-login-prompt, .sl-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
        .sl-login-prompt p, .sl-empty p { color: rgba(148,163,184,0.5); font-size: 14px; margin: 12px 0 0; }
        .sl-loading { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; gap: 12px; }
        .sl-spinner { width: 32px; height: 32px; border: 3px solid rgba(148,163,184,0.1); border-top-color: #ffffff; border-radius: 50%; animation: spin 0.8s linear infinite; box-shadow: 0 0 12px rgba(255,255,255,0.15); }
        .sl-loading span { color: rgba(148,163,184,0.5); font-size: 13px; }
        .sl-venue-list { display: flex; flex-direction: column; gap: 16px; }
        .sl-venue-group { background: linear-gradient(160deg, rgba(18,28,45,0.85), rgba(10,16,28,0.92)); border: 1.5px solid rgba(148,163,184,0.12); border-radius: 14px; overflow: hidden; box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 4px 16px rgba(0,0,0,0.35); }
        .sl-venue-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid rgba(148,163,184,0.08); }
        .sl-venue-info { flex: 1; }
        .sl-venue-name { font-size: 16px; font-weight: 600; color: #e2e8f0; }
        .sl-venue-loc { font-size: 12px; color: rgba(148,163,184,0.5); margin-top: 2px; }
        .sl-venue-count { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08)); border: 1px solid rgba(255,255,255,0.25); color: #ffffff; font-size: 13px; font-weight: 600; }
        .sl-friend-list { padding: 8px; }
        .sl-friend-card { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 10px; transition: background 0.2s; }
        .sl-friend-card:hover { background: rgba(148,163,184,0.04); }
        .sl-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .sl-friend-info { flex: 1; min-width: 0; }
        .sl-friend-name { font-size: 14px; font-weight: 600; color: #e2e8f0; }
        .sl-friend-time { font-size: 12px; color: rgba(148,163,184,0.5); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .sl-online-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
        .sl-friend-msg { color: rgba(148,163,184,0.35); font-style: italic; }
        .sl-invite-btn { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 8px; background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08)); border: 1.5px solid rgba(255,255,255,0.35); color: #ffffff; font-size: 12px; font-weight: 600; cursor: pointer; flex-shrink: 0; transition: all 0.25s; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); }
        .sl-invite-btn:hover { border-color: rgba(255,255,255,0.5); box-shadow: 0 0 10px rgba(255,255,255,0.12); }
        .sl-modal-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .sl-modal { background: linear-gradient(160deg, rgba(18,28,45,0.98), rgba(10,16,28,1)); border: 2px solid rgba(148,163,184,0.16); border-radius: 16px; padding: 24px; max-width: 420px; width: 100%; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 16px 64px rgba(0,0,0,0.6); }
        .sl-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .sl-modal-header h3 { font-size: 18px; font-weight: 600; color: #e2e8f0; margin: 0; }
        .sl-modal-close { background: none; border: none; color: rgba(148,163,184,0.5); font-size: 24px; cursor: pointer; transition: color 0.2s; }
        .sl-modal-close:hover { color: #ffffff; }
        .sl-modal-text { font-size: 14px; color: rgba(148,163,184,0.6); margin: 0 0 16px; }
        .sl-invite-link-box { display: flex; gap: 8px; }
        .sl-invite-link-input { flex: 1; padding: 10px 12px; background: linear-gradient(180deg, rgba(20,30,48,0.95), rgba(12,18,30,0.98)); border: 1.5px solid rgba(148,163,184,0.15); border-radius: 8px; color: #e2e8f0; font-size: 12px; font-family: monospace; box-shadow: inset 0 2px 6px rgba(0,0,0,0.4); }
        .sl-copy-btn { padding: 10px 16px; background: linear-gradient(135deg, #ffffff, #cbd5e1); border: none; border-radius: 8px; color: #000; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .sl-empty-icon { width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: center; margin-bottom: 12px; }
        .sl-empty-ctas { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
        .sl-cta-btn { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.25s; border: 1.5px solid; font-family: inherit; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px rgba(0,0,0,0.3); }
        .sl-cta-checkin { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); color: #22c55e; }
        .sl-cta-checkin:hover { background: rgba(34,197,94,0.2); }
        .sl-cta-invite { background: linear-gradient(180deg, rgba(255,255,255,0.12), rgba(200,214,229,0.08)); border-color: rgba(255,255,255,0.35); color: #ffffff; }
        .sl-cta-invite:hover { border-color: rgba(255,255,255,0.5); }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
