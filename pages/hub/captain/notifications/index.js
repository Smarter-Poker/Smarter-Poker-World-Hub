/**
 * Player Notifications Page
 * View announcements and notifications from venues
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Bell,
  MapPin,
  Clock,
  Users,
  Gift,
  Trophy,
  AlertCircle,
  Check,
  Trash2,
  Loader2
} from 'lucide-react';

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
  announcement: '#1877F2',
  waitlist: '#6B7280',
  alert: '#EF4444'
};

function NotificationCard({ notification, onMarkRead, onDelete }) {
  const Icon = NOTIFICATION_ICONS[notification.type] || Bell;
  const color = NOTIFICATION_COLORS[notification.type] || '#1877F2';
  const date = new Date(notification.created_at);
  const isUnread = !notification.read_at;

  return (
    <div className={`bg-white rounded-xl border p-4 ${isUnread ? 'border-[#1877F2]' : 'border-[#E5E7EB]'}`}>
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className={`font-medium ${isUnread ? 'text-[#1F2937]' : 'text-[#6B7280]'}`}>
                {notification.title}
              </p>
              {notification.venue_name && (
                <p className="text-sm text-[#6B7280] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {notification.venue_name}
                </p>
              )}
            </div>
            {isUnread && (
              <span className="w-2 h-2 bg-[#1877F2] rounded-full flex-shrink-0 mt-2" />
            )}
          </div>

          {notification.message && (
            <p className="text-sm text-[#6B7280] mt-2">{notification.message}</p>
          )}

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-[#9CA3AF]">
              {date.toLocaleDateString()} at {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>

            <div className="flex items-center gap-2">
              {isUnread && (
                <button
                  onClick={() => onMarkRead?.(notification)}
                  className="p-1.5 text-[#6B7280] hover:text-[#10B981] hover:bg-[#10B981]/10 rounded transition-colors"
                  title="Mark as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => onDelete?.(notification)}
                className="p-1.5 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded transition-colors"
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

  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'unread'

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/notifications');
      return;
    }
    fetchNotifications();
  }, [router]);

  async function fetchNotifications() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/notifications/my', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        setNotifications(data.data?.notifications || []);
      }
    } catch (err) {
      console.error('Fetch notifications failed:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkRead(notification) {
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, read_at: new Date().toISOString() } : n)
    );
    // API call would go here
  }

  async function handleDelete(notification) {
    setNotifications(prev => prev.filter(n => n.id !== notification.id));
    // API call would go here
  }

  async function handleMarkAllRead() {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
    );
    // API call would go here
  }

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read_at;
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read_at).length;

  return (
    <>
      <Head>
        <title>Notifications | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-6 h-6 text-[#1877F2]" />
                <h1 className="text-xl font-bold text-[#1F2937]">Notifications</h1>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-[#1877F2] text-white text-xs font-medium rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm font-medium text-[#1877F2] hover:underline"
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === value
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Bell className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="text-sm text-[#9CA3AF] mt-1">
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
