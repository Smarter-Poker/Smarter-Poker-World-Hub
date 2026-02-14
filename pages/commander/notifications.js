/**
 * Notification Center
 * /commander/notifications
 * View all notifications, mark read, filter unread
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Bell, BellOff, CheckCheck, Loader2, RefreshCw, Trash2,
  Trophy, Users, Clock, DollarSign, AlertTriangle, MessageSquare, Star
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const TYPE_CONFIG = {
  seat_available: { icon: Users, color: '#31A24C', label: 'Seat Available' },
  tournament_starting: { icon: Trophy, color: '#F59E0B', label: 'Tournament' },
  called_for_seat: { icon: Bell, color: '#1877F2', label: 'Called' },
  promotion: { icon: Star, color: '#A855F7', label: 'Promotion' },
  comp_earned: { icon: DollarSign, color: '#31A24C', label: 'Comp Earned' },
  announcement: { icon: MessageSquare, color: '#1877F2', label: 'Announcement' },
  alert: { icon: AlertTriangle, color: '#EF4444', label: 'Alert' },
  custom: { icon: Bell, color: '#B0B3B8', label: 'Notification' },
};

export default function NotificationCenter() {
  const router = useRouter();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unread
  const [markingAll, setMarkingAll] = useState(false);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = filter === 'unread' ? '&unread_only=true' : '';
      const res = await fetch(`/api/commander/notifications/my?limit=100${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data?.notifications || []);
        setUnreadCount(json.data?.unread_count || 0);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await fetch(`/api/commander/notifications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ read_at: new Date().toISOString() })
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    try {
      await fetch('/api/commander/notifications/mark-all-read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) { console.error(err); }
    finally { setMarkingAll(false); }
  };

  const deleteNotification = async (id) => {
    try {
      await fetch(`/api/commander/notifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) { console.error(err); }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <CommanderLayout title="Notifications" backHref="/commander/dashboard"><div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
<div className="flex-1">
            <h1 className="text-lg font-bold text-white">Notifications</h1>
            <p className="text-xs text-[#B0B3B8]">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} disabled={markingAll}
              className="px-3 py-2 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-medium flex items-center gap-1.5 active:bg-[#4A4B4C] disabled:opacity-50">
              {markingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
              Mark all read
            </button>
          )}
          <button onClick={fetchNotifications} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
        </div>

        {/* Filter */}
        <div className="px-4 py-3 flex gap-2">
          {['all', 'unread'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-semibold capitalize ${
                filter === f ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8] active:bg-[#4A4B4C]'
              }`}>{f}{f === 'unread' && unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <BellOff className="w-12 h-12 text-[#3A3B3C] mb-3" />
            <p className="text-[#6A6B6D] text-sm">{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
          </div>
        ) : (
          <div className="px-4 pb-6">
            <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl overflow-hidden divide-y divide-[#3A3B3C]">
              {notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.custom;
                const Icon = cfg.icon;
                const isUnread = !n.read_at;
                return (
                  <div key={n.id}
                    onClick={() => isUnread && markAsRead(n.id)}
                    className={`px-4 py-3 flex items-start gap-3 ${isUnread ? 'bg-[#1877F2]/5 cursor-pointer' : ''}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: cfg.color + '15' }}>
                      <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase" style={{ color: cfg.color }}>{cfg.label}</span>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-[#1877F2]" />}
                        <span className="text-[10px] text-[#6A6B6D] ml-auto">{formatTime(n.created_at)}</span>
                      </div>
                      {n.title && <p className="text-sm font-medium text-white mt-0.5">{n.title}</p>}
                      <p className="text-sm text-[#B0B3B8] mt-0.5">{n.message || n.body}</p>
                      {n.poker_venues?.name && (
                        <p className="text-[10px] text-[#6A6B6D] mt-1">{n.poker_venues.name}</p>
                      )}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center active:bg-[#3A3B3C] shrink-0 opacity-40 hover:opacity-100">
                      <Trash2 className="w-3.5 h-3.5 text-[#B0B3B8]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    <style jsx>{`
      `}</style>
    </>
  );
}
