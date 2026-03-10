/**
 * NotificationBell — In-app notification center
 * Bell icon with unread badge + dropdown panel
 * 
 * Usage: <NotificationBell userId={user.id} />
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '../../lib/authUtils';
import Link from 'next/link';

const FB = {
  bg: '#242526', card: '#18191A', text: '#E4E6EB', dim: '#B0B3B8',
  border: '#3E4042', primary: '#1877F2', success: '#31A24C', danger: '#FA383E',
  gold: '#FFD700',
};

const ICON_MAP = {
  chip_distribution: '💰', cashout_approved: '✅', cashout_cancelled: '↩️',
  cashout_requested: '📤', tournament_start: '🏆', tournament_created: '🎯',
  join_request: '🙋', member_approved: '✅', member_removed: '🚫',
  rakeback_claimed: '🎁', settlement_complete: '📊', promo_distributed: '🎁',
  table_opened: '🃏', bbj_won: '🎰', agent_credit: '💳',
  default: '🔔',
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell({ userId }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const token = getAccessToken();
      if (!token) return;
      const res = await fetch('/api/notifications/list?limit=20&blocked=like,comment,share,mention,tag,hand_reaction', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        const notifs = d.notifications || [];
        setNotifications(notifs);
        setUnreadCount(notifs.filter(n => !n.is_read).length);
      }
    } catch (_) { /* silent */ }
  }, [userId]);

  useEffect(() => {
    loadNotifications();
    const iv = setInterval(loadNotifications, 30000); // Poll every 30s
    return () => clearInterval(iv);
  }, [loadNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    try {
      const token = getAccessToken();
      if (!token) return;
      await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (_) { /* silent */ }
  };

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(p => !p); if (!open) loadNotifications(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          position: 'relative', padding: 6,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#B0B3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: FB.danger, color: '#fff', fontSize: 9, fontWeight: 800,
            minWidth: 16, height: 16, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0,
          width: 320, maxHeight: 400, overflowY: 'auto',
          background: FB.bg, border: `1px solid ${FB.border}`,
          borderRadius: 12, boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${FB.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: FB.text, fontSize: 15, fontWeight: 700 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: FB.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div style={{ padding: '30px 16px', textAlign: 'center', color: FB.dim, fontSize: 13 }}>
              No notifications yet
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                style={{
                  padding: '10px 16px',
                  borderBottom: `1px solid ${FB.border}20`,
                  background: n.is_read ? 'transparent' : 'rgba(35,116,225,0.06)',
                  cursor: 'default',
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                    {ICON_MAP[n.type] || ICON_MAP.default}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: FB.text, fontSize: 13, fontWeight: n.is_read ? 400 : 600, lineHeight: 1.4 }}>
                      {n.title || n.message || 'Notification'}
                    </div>
                    {n.message && n.title && (
                      <div style={{ color: FB.dim, fontSize: 11, marginTop: 2, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {n.message}
                      </div>
                    )}
                    <div style={{ color: FB.dim, fontSize: 10, marginTop: 3 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {!n.is_read && (
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: FB.primary, flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              </div>
            ))
          )}

          {/* Footer */}
          <div style={{ padding: '8px 16px', borderTop: `1px solid ${FB.border}`, textAlign: 'center' }}>
            <Link
              href="/hub/notifications"
              style={{ color: FB.primary, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}
            >
              View All Notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
