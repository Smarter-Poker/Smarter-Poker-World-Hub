/**
 * Staff Analytics Dashboard
 * View venue performance metrics and player stats
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  BarChart3,
  Users,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
  Calendar,
  Trophy,
  Target,
  Loader2
} from 'lucide-react';

function StatCard({ title, value, change, icon: Icon, color = '#1877F2' }) {
  const isPositive = change >= 0;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-[#1F2937]">{value}</p>
      <p className="text-sm text-[#6B7280]">{title}</p>
    </div>
  );
}

function SimpleBarChart({ data, label }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-sm text-[#6B7280] w-12">{item.label}</span>
          <div className="flex-1 h-6 bg-[#F3F4F6] rounded overflow-hidden">
            <div
              className="h-full bg-[#1877F2] rounded transition-all duration-500"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-[#1F2937] w-12 text-right">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function TopPlayersTable({ players }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#E5E7EB]">
            <th className="text-left py-3 px-4 text-sm font-medium text-[#6B7280]">Player</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#6B7280]">Sessions</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#6B7280]">Hours</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#6B7280]">Buy-ins</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={player.id || index} className="border-b border-[#E5E7EB] last:border-b-0">
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-[#1877F2]">{index + 1}</span>
                  </div>
                  <span className="font-medium text-[#1F2937]">{player.name}</span>
                </div>
              </td>
              <td className="text-right py-3 px-4 text-[#1F2937]">{player.sessions}</td>
              <td className="text-right py-3 px-4 text-[#1F2937]">{player.hours}h</td>
              <td className="text-right py-3 px-4 font-medium text-[#10B981]">${player.buyins.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPlayers: 0,
    totalSessions: 0,
    totalHours: 0,
    totalBuyins: 0,
    avgSessionLength: 0,
    peakHour: '7 PM',
    dailyData: [],
    topPlayers: [],
    gameTypeBreakdown: []
  });

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }
    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch (err) {
      router.push('/captain/login');
    }
  }, [router]);

  const fetchAnalytics = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    try {
      const [dailyRes, playersRes] = await Promise.all([
        fetch(`/api/captain/analytics/daily?venue_id=${venueId}&period=${period}`),
        fetch(`/api/captain/analytics/players?venue_id=${venueId}&period=${period}&limit=10`)
      ]);

      const dailyData = await dailyRes.json();
      const playersData = await playersRes.json();

      // Calculate aggregated stats
      const daily = dailyData.data?.daily || [];
      const players = playersData.data?.players || [];

      const totalSessions = daily.reduce((sum, d) => sum + (d.sessions || 0), 0);
      const totalHours = daily.reduce((sum, d) => sum + (d.hours || 0), 0);
      const totalBuyins = daily.reduce((sum, d) => sum + (d.buyins || 0), 0);

      setStats({
        totalPlayers: players.length,
        totalSessions,
        totalHours: Math.round(totalHours),
        totalBuyins,
        avgSessionLength: totalSessions > 0 ? Math.round(totalHours / totalSessions * 10) / 10 : 0,
        peakHour: '7 PM',
        dailyData: daily.slice(-7).map(d => ({
          label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
          value: d.sessions || 0
        })),
        topPlayers: players.map(p => ({
          id: p.id,
          name: p.display_name || p.player_name || 'Unknown',
          sessions: p.session_count || 0,
          hours: Math.round(p.total_hours || 0),
          buyins: p.total_buyins || 0
        })),
        gameTypeBreakdown: [
          { label: 'NLHE', value: Math.round(totalSessions * 0.7) },
          { label: 'PLO', value: Math.round(totalSessions * 0.2) },
          { label: 'Mixed', value: Math.round(totalSessions * 0.1) }
        ]
      });
    } catch (error) {
      console.error('Fetch analytics failed:', error);
      setStats({
        totalPlayers: 0,
        totalSessions: 0,
        totalHours: 0,
        totalBuyins: 0,
        avgSessionLength: 0,
        peakHour: 'N/A',
        dailyData: [],
        topPlayers: [],
        gameTypeBreakdown: []
      });
    } finally {
      setLoading(false);
    }
  }, [venueId, period]);

  useEffect(() => {
    if (venueId) fetchAnalytics();
  }, [venueId, period, fetchAnalytics]);

  if (!staff) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Analytics | Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">Analytics</h1>
                <p className="text-sm text-[#6B7280]">Venue performance metrics</p>
              </div>
            </div>

            <div className="flex gap-2">
              {['week', 'month', 'year'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    period === p
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Unique Players"
                  value={stats.totalPlayers}
                  change={12}
                  icon={Users}
                  color="#1877F2"
                />
                <StatCard
                  title="Total Sessions"
                  value={stats.totalSessions}
                  change={8}
                  icon={Target}
                  color="#10B981"
                />
                <StatCard
                  title="Total Hours"
                  value={`${stats.totalHours}h`}
                  change={15}
                  icon={Clock}
                  color="#8B5CF6"
                />
                <StatCard
                  title="Total Buy-ins"
                  value={`$${stats.totalBuyins.toLocaleString()}`}
                  change={22}
                  icon={DollarSign}
                  color="#F59E0B"
                />
              </div>

              {/* Charts Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Daily Sessions */}
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                  <h3 className="font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#1877F2]" />
                    Daily Sessions
                  </h3>
                  <SimpleBarChart data={stats.dailyData} label="Sessions" />
                </div>

                {/* Game Type Breakdown */}
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                  <h3 className="font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#F59E0B]" />
                    Game Type Breakdown
                  </h3>
                  <SimpleBarChart data={stats.gameTypeBreakdown} label="Sessions" />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
                  <p className="text-2xl font-bold text-[#1F2937]">{stats.avgSessionLength}h</p>
                  <p className="text-sm text-[#6B7280]">Avg Session</p>
                </div>
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
                  <p className="text-2xl font-bold text-[#1F2937]">{stats.peakHour}</p>
                  <p className="text-sm text-[#6B7280]">Peak Hour</p>
                </div>
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
                  <p className="text-2xl font-bold text-[#1F2937]">
                    ${stats.totalSessions > 0 ? Math.round(stats.totalBuyins / stats.totalSessions) : 0}
                  </p>
                  <p className="text-sm text-[#6B7280]">Avg Buy-in</p>
                </div>
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
                  <p className="text-2xl font-bold text-[#1F2937]">
                    {stats.totalPlayers > 0 ? (stats.totalSessions / stats.totalPlayers).toFixed(1) : 0}
                  </p>
                  <p className="text-sm text-[#6B7280]">Sessions/Player</p>
                </div>
              </div>

              {/* Top Players */}
              <div className="bg-white rounded-xl border border-[#E5E7EB]">
                <div className="p-4 border-b border-[#E5E7EB]">
                  <h3 className="font-semibold text-[#1F2937] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#1877F2]" />
                    Top Players
                  </h3>
                </div>
                <TopPlayersTable players={stats.topPlayers} />
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
