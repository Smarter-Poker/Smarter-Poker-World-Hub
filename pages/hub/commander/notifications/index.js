/**
 * Player Notifications Page
 * View announcements and notifications from venues
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { Bell, MapPin, Clock, Users, Gift, Trophy, AlertCircle, Check, Trash2 } from 'lucide-react';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { supabase } from '../../../../src/lib/supabase';

const NOTIFICATION_ICONS = {
  seat_available: Users,
  promotion: Gift,
  tournament: Trophy,
  announcement: Bell,
  waitlist: Clock,
  alert: AlertCircle
};

const NOTIFICATION_COLORS = {
  seat_available: '#10B981',
  promotion: '#F59E0B',
  tournament: '#8B5CF6',
  announcement: '#22D3EE',
  waitlist: '#64748B',
  alert: '#EF4444'
};

function NotificationCard({ notification, onMarkRead, onDelete }) {
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const color = NOTIFICATION_COLORS[notification.type] || '#22D3EE';
  const date = new Date(notification.created_at);
  const isUnread = !notification.read_at;

  return (
    <div className={`cmd-panel p-4 ${isUnread ? 'shadow-[0_0_20px_rgba(34,211,238,0.2)]' : ''}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2"
          style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`font-medium ${isUnread ? 'text-white' : 'text-[#64748B]'}`}>
                {notification.title}
              </p>
              {notification.venue_name && (
                <p className="text-sm text-[#64748B] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {notification.venue_name}
                </p>
              )}
            </div>
            {isUnread && (
              <span className="w-2.5 h-2.5 bg-[#22D3EE] rounded-full flex-shrink-0 mt-2 shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
            )}
          </div>

          {notification.message && (
            <p className="text-sm text-[#64748B] mt-2">{notification.message}</p>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[#64748B]">
              {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-2">
              {isUnread && (
                <button
                  onClick={() => onMarkRead?.(notification)}
                  className="p-1.5 text-[#64748B] hover:text-[#10B981] hover:bg-[#10B981]/10 rounded transition-colors"
                  title="Mark As Read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onDelete?.(notification)}
                className="p-1.5 text-[#64748B] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded transition-colors"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PlayerNotificationsPage() {
  const router = useRouter();

  const [filter, setFilter] = useState('all'); // 'all', 'unread'
  const [notifications, setNotifications] = useState([]);

  const getToken = () => {
    let token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
    }
    return token;
  };

  useEffect(() => {
    if (!getToken()) router.push('/auth/login?redirect=/hub/commander/notifications');
  }, [router]);
  // Realtime listener — live updates for notifications/index.js
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase
      .channel(`notifications:${user?.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commander_notifications' }, () => {})
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const { isLoading: loading, mutate: refreshNotifications } = useSWR(
    '/api/commander/notifications/my',
    (url) => {
      const token = getToken();
      if (!token) return null;
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (d.success) setNotifications(d.data?.notifications || []); return d; });
    }
  );

  async function handleMarkRead(notification) {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
    );

    try {
      let token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
      }

      await fetch(`/api/commander/notifications/${notification.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
    } catch (err) {
      console.error('Mark read failed:', err);
      // Revert on error
      setNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, read_at: null } : n)
      );
    }
  }

  async function handleDelete(notification) {
    // Optimistic update
    const prevNotifications = [...notifications];
    setNotifications(prev => prev.filter(n => n.id !== notification.id));

    try {
      let token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
      }

      await fetch(`/api/commander/notifications/${notification.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Delete failed:', err);
      // Revert on error
      setNotifications(prevNotifications);
    }
  }

  async function handleMarkAllRead(signal) {
    // Optimistic update
    const prevNotifications = [...notifications];
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );

    try {
      let token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
      }

      await fetch('/api/commander/notifications/mark-all-read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Mark all read failed:', err);
      // Revert on error
      setNotifications(prevNotifications);
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read_at;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <>
      <SEOHead
                title="Commander Notifications"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="cmd-icon-box w-12 h-12">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-white tracking-wider">NOTIFICATIONS</h1>
                  {unreadCount > 0 && (
                    <span className="cmd-badge cmd-badge-live text-xs mt-1">
                      {unreadCount} UNREAD
                    </span>
                  )}
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm font-bold text-[#22D3EE] hover:text-white uppercase tracking-wide transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
          {/* Filter */}
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'All' },
              { value: 'unread', label: `Unread (${unreadCount})` }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors border-2 ${filter === value
                  ? 'bg-[#132240] text-[#22D3EE] border-[#22D3EE]'
                  : 'bg-[#0F1C32] text-[#64748B] border-[#4A5E78] hover:border-[#7A8EA8]'
                  }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          {(loading) ? (<div style={{ padding: 24 }}><SkeletonLoader variant="rows" rows={6} /></div>) : filteredNotifications.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <div className="cmd-icon-box mx-auto mb-3">
                <Bell className="w-7 h-7" />
              </div>
              <p className="text-[#64748B] font-medium">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="text-sm text-[#64748B] mt-1">
                Join a waitlist to receive updates
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  onMarkRead={handleMarkRead}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
