/**
 * SocialLayer.jsx — Feature #4: Social Layer: See Friends At Venues
 * Shows friends checked in at venues with geofence integration.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';

const REFRESH_INTERVAL = 60000; // 1 minute

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

    // Fetch friends list
    const fetchFriends = useCallback(async () => {
        if (!userId) {
            setLoading(false);
            return;
        }
        try {
            const headers = {};
            if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
            const res = await fetch(`/api/friends/list?user_id=${userId}`, { headers });
            if (!res.ok) {
                // API may not exist yet or user has no friends — show empty state
                setLoading(false);
                return;
            }
            const data = await res.json();
            setFriendsList(data.friends || data.data || []);
        } catch (err) {
            console.error('Failed to fetch friends:', err);
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

            // Batch fetch checkins for each friend (last 24h)
            const allCheckins = [];
            for (const fid of friendIds.slice(0, 50)) {
                try {
                    const res = await fetch(`/api/poker/checkins?user_id=${fid}`);
                    const data = await res.json();
                    if (data.checkins) {
                        allCheckins.push(...data.checkins.map(c => ({
                            ...c,
                            friend: friendsList.find(f => (f.friend_id || f.id) === fid),
                        })));
                    }
                } catch { /* continue */ }
            }

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

            setFriendCheckins(Object.values(venueMap));
        } catch (err) {
            console.error('Failed to fetch friend checkins:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, friendsList, venues]);

    useEffect(() => {
        fetchFriends();
    }, [fetchFriends]);

    useEffect(() => {
        if (friendsList.length > 0) {
            fetchFriendCheckins();
            refreshRef.current = setInterval(fetchFriendCheckins, REFRESH_INTERVAL);
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
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                    </svg>
                    <p style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>No Friends Checked In</p>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                        {friendsList.length === 0
                            ? 'Add friends to see when they visit poker rooms!'
                            : `None of your ${friendsList.length} friends are checked in right now`}
                    </p>
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

            <style jsx>{`
        .social-layer { padding: 0 0 20px; }
        .sl-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .sl-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; flex: 1; }
        .sl-badge { padding: 4px 12px; border-radius: 20px; background: rgba(34,197,94,0.15); border: 1px solid rgba(34,197,94,0.3); color: #22c55e; font-size: 12px; font-weight: 600; }
        .sl-login-prompt, .sl-empty { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; text-align: center; }
        .sl-login-prompt p, .sl-empty p { color: rgba(255,255,255,0.5); font-size: 14px; margin: 12px 0 0; }
        .sl-loading { display: flex; flex-direction: column; align-items: center; padding: 60px 20px; gap: 12px; }
        .sl-spinner { width: 32px; height: 32px; border: 3px solid rgba(255,255,255,0.1); border-top-color: #d4a853; border-radius: 50%; animation: spin 0.8s linear infinite; }
        .sl-loading span { color: rgba(255,255,255,0.4); font-size: 13px; }
        .sl-venue-list { display: flex; flex-direction: column; gap: 16px; }
        .sl-venue-group { background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; overflow: hidden; }
        .sl-venue-header { display: flex; justify-content: space-between; align-items: center; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .sl-venue-info { flex: 1; }
        .sl-venue-name { font-size: 16px; font-weight: 600; color: #fff; }
        .sl-venue-loc { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }
        .sl-venue-count { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; background: rgba(212,168,83,0.15); color: #d4a853; font-size: 13px; font-weight: 600; }
        .sl-friend-list { padding: 8px; }
        .sl-friend-card { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-radius: 10px; transition: background 0.2s; }
        .sl-friend-card:hover { background: rgba(255,255,255,0.04); }
        .sl-avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .sl-friend-info { flex: 1; min-width: 0; }
        .sl-friend-name { font-size: 14px; font-weight: 600; color: #fff; }
        .sl-friend-time { font-size: 12px; color: rgba(255,255,255,0.4); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
        .sl-online-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }
        .sl-friend-msg { color: rgba(255,255,255,0.3); font-style: italic; }
        .sl-invite-btn { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: 8px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #3b82f6; font-size: 12px; font-weight: 500; cursor: pointer; flex-shrink: 0; transition: all 0.2s; }
        .sl-invite-btn:hover { background: rgba(59,130,246,0.25); }
        .sl-modal-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 20px; }
        .sl-modal { background: #1e293b; border: 1px solid rgba(255,255,255,0.15); border-radius: 16px; padding: 24px; max-width: 420px; width: 100%; }
        .sl-modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .sl-modal-header h3 { font-size: 18px; font-weight: 600; color: #fff; margin: 0; }
        .sl-modal-close { background: none; border: none; color: rgba(255,255,255,0.4); font-size: 24px; cursor: pointer; }
        .sl-modal-text { font-size: 14px; color: rgba(255,255,255,0.6); margin: 0 0 16px; }
        .sl-invite-link-box { display: flex; gap: 8px; }
        .sl-invite-link-input { flex: 1; padding: 10px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #fff; font-size: 12px; font-family: monospace; }
        .sl-copy-btn { padding: 10px 16px; background: linear-gradient(135deg, #d4a853, #b8860b); border: none; border-radius: 8px; color: #000; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
        </div>
    );
}
