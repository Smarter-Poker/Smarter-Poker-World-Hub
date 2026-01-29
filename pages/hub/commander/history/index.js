/**
 * Player Session History Page
 * View past poker sessions with stats
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  History,
  Clock,
  DollarSign,
  MapPin,
  Calendar,
  TrendingUp,
  ChevronRight,
  Filter,
  Loader2
} from 'lucide-react';

function SessionCard({ session }) {
  const checkIn = new Date(session.check_in_at);
  const checkOut = session.check_out_at ? new Date(session.check_out_at) : null;
  const duration = session.total_time_minutes || 0;
  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">
            {session.venue_name || 'Poker Room'}
          </p>
          <p className="text-sm text-[#64748B]">
            {checkIn.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <span className={
          session.status === 'active'
            ? 'cmd-badge cmd-badge-live'
            : 'cmd-badge cmd-badge-chrome'
        }>
          {session.status === 'active' ? 'In Progress' : 'Completed'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[#64748B] flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Duration
          </p>
          <p className="font-semibold text-white">
            {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
          </p>
        </div>
        <div>
          <p className="text-[#64748B] flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            Buy-in
          </p>
          <p className="font-semibold text-white">
            ${session.total_buyin || 0}
          </p>
        </div>
        <div>
          <p className="text-[#64748B] flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            Games
          </p>
          <p className="font-semibold text-white">
            {session.games_played || 0}
          </p>
        </div>
      </div>

      {session.stakes && (
        <div className="mt-3 pt-3 border-t border-[#4A5E78]">
          <span className="text-sm text-[#64748B]">
            {session.stakes} {session.game_type?.toUpperCase() || 'NLHE'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function PlayerHistoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalHours: 0,
    totalBuyins: 0,
    avgSession: 0
  });
  const [filter, setFilter] = useState('all'); // 'all', 'week', 'month', 'year'

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/commander/history');
      return;
    }
    fetchHistory();
  }, [router, filter]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/sessions?period=${filter}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      if (data.success) {
        const sessionList = data.data?.sessions || [];
        setSessions(sessionList);

        // Calculate stats
        const totalSessions = sessionList.length;
        const totalMinutes = sessionList.reduce((sum, s) => sum + (s.total_time_minutes || 0), 0);
        const totalBuyins = sessionList.reduce((sum, s) => sum + (s.total_buyin || 0), 0);

        setStats({
          totalSessions,
          totalHours: Math.round(totalMinutes / 60),
          totalBuyins,
          avgSession: totalSessions > 0 ? Math.round(totalMinutes / totalSessions / 60 * 10) / 10 : 0
        });
      }
    } catch (err) {
      console.error('Fetch history failed:', err);
      setSessions([]);
      setStats({
        totalSessions: 0,
        totalHours: 0,
        totalBuyins: 0,
        avgSession: 0
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>My History | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="cmd-icon-box cmd-icon-box-glow">
                <History className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold">My History</h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="cmd-inset rounded-lg p-3">
                <p className="text-[#64748B] text-sm">Total Sessions</p>
                <p className="text-2xl font-bold text-white">{stats.totalSessions}</p>
              </div>
              <div className="cmd-inset rounded-lg p-3">
                <p className="text-[#64748B] text-sm">Hours Played</p>
                <p className="text-2xl font-bold text-white">{stats.totalHours}h</p>
              </div>
              <div className="cmd-inset rounded-lg p-3">
                <p className="text-[#64748B] text-sm">Total Buy-ins</p>
                <p className="text-2xl font-bold text-white">${stats.totalBuyins.toLocaleString()}</p>
              </div>
              <div className="cmd-inset rounded-lg p-3">
                <p className="text-[#64748B] text-sm">Avg Session</p>
                <p className="text-2xl font-bold text-white">{stats.avgSession}h</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { value: 'all', label: 'All Time' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
              { value: 'year', label: 'This Year' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === value
                    ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                    : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sessions List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <div className="cmd-icon-box mx-auto mb-3">
                <History className="w-6 h-6" />
              </div>
              <p className="text-[#64748B]">No sessions found</p>
              <p className="text-sm text-[#64748B] mt-1">
                Check in at a venue to start tracking
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard key={session.id} session={session} />
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
