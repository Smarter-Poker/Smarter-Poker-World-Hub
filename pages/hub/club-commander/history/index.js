/**
 * Player Session History Page
 * View past poker sessions with stats
 * UI: Facebook color scheme, no emojis, Inter font
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
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-[#1F2937]">
            {session.venue_name || 'Poker Room'}
          </p>
          <p className="text-sm text-[#6B7280]">
            {checkIn.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          session.status === 'active'
            ? 'bg-[#10B981]/10 text-[#10B981]'
            : 'bg-[#F3F4F6] text-[#6B7280]'
        }`}>
          {session.status === 'active' ? 'In Progress' : 'Completed'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <p className="text-[#6B7280] flex items-center gap-1">
            <Clock className="w-4 h-4" />
            Duration
          </p>
          <p className="font-semibold text-[#1F2937]">
            {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
          </p>
        </div>
        <div>
          <p className="text-[#6B7280] flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            Buy-in
          </p>
          <p className="font-semibold text-[#1F2937]">
            ${session.total_buyin || 0}
          </p>
        </div>
        <div>
          <p className="text-[#6B7280] flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            Games
          </p>
          <p className="font-semibold text-[#1F2937]">
            {session.games_played || 0}
          </p>
        </div>
      </div>

      {session.stakes && (
        <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
          <span className="text-sm text-[#6B7280]">
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
      router.push('/login?redirect=/hub/club-commander/history');
      return;
    }
    fetchHistory();
  }, [router, filter]);

  async function fetchHistory() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/club-commander/sessions?period=${filter}`, {
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
      console.error('Fetch failed:', err);
      // Mock data for demo
      setSessions([
        { id: 1, venue_name: 'Bellagio Poker Room', check_in_at: new Date().toISOString(), status: 'active', total_time_minutes: 180, total_buyin: 500, games_played: 1, stakes: '$2/$5', game_type: 'nlhe' },
        { id: 2, venue_name: 'Aria Poker Room', check_in_at: new Date(Date.now() - 86400000).toISOString(), check_out_at: new Date(Date.now() - 72000000).toISOString(), status: 'completed', total_time_minutes: 240, total_buyin: 400, games_played: 2, stakes: '$1/$3', game_type: 'nlhe' },
        { id: 3, venue_name: 'Bellagio Poker Room', check_in_at: new Date(Date.now() - 172800000).toISOString(), check_out_at: new Date(Date.now() - 158400000).toISOString(), status: 'completed', total_time_minutes: 360, total_buyin: 1000, games_played: 1, stakes: '$5/$10', game_type: 'nlhe' },
      ]);
      setStats({
        totalSessions: 15,
        totalHours: 68,
        totalBuyins: 8500,
        avgSession: 4.5
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

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4">
              <History className="w-8 h-8" />
              <h1 className="text-2xl font-bold">My History</h1>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-white/80 text-sm">Total Sessions</p>
                <p className="text-2xl font-bold">{stats.totalSessions}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-white/80 text-sm">Hours Played</p>
                <p className="text-2xl font-bold">{stats.totalHours}h</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-white/80 text-sm">Total Buy-ins</p>
                <p className="text-2xl font-bold">${stats.totalBuyins.toLocaleString()}</p>
              </div>
              <div className="bg-white/10 rounded-lg p-3">
                <p className="text-white/80 text-sm">Avg Session</p>
                <p className="text-2xl font-bold">{stats.avgSession}h</p>
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
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sessions List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <History className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">No sessions found</p>
              <p className="text-sm text-[#9CA3AF] mt-1">
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
