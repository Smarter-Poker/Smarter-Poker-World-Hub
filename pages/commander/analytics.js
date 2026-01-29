/**
 * Staff Analytics Dashboard
 * View venue performance metrics and player stats
 * Dark industrial sci-fi gaming theme
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

function StatCard({ title, value, change, icon: Icon, color = '#22D3EE' }) {
  const hasChange = change !== undefined && change !== null;
  const isPositive = hasChange && change >= 0;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-2">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {change === null ? (
          <span className="text-sm font-medium text-[#64748B]">N/A</span>
        ) : hasChange ? (
          <div className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {Math.abs(change)}%
          </div>
        ) : null}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-[#64748B]">{title}</p>
    </div>
  );
}

function SimpleBarChart({ data, label }) {
  const maxValue = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-sm text-[#64748B] w-12">{item.label}</span>
          <div className="flex-1 h-6 bg-[#0D192E] rounded overflow-hidden">
            <div
              className="h-full bg-[#1877F2] rounded transition-all duration-500"
              style={{ width: `${(item.value / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-sm font-medium text-white w-12 text-right">{item.value}</span>
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
          <tr className="border-b border-[#4A5E78]">
            <th className="text-left py-3 px-4 text-sm font-medium text-[#64748B]">Player</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#64748B]">Sessions</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#64748B]">Hours</th>
            <th className="text-right py-3 px-4 text-sm font-medium text-[#64748B]">Buy-ins</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <tr key={player.id || index} className="border-b border-[#4A5E78] last:border-b-0">
              <td className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-[#22D3EE]">{index + 1}</span>
                  </div>
                  <span className="font-medium text-white">{player.name}</span>
                </div>
              </td>
              <td className="text-right py-3 px-4 text-white">{player.sessions}</td>
              <td className="text-right py-3 px-4 text-white">{player.hours}h</td>
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
    peakHour: '--',
    playersChange: undefined,
    sessionsChange: undefined,
    hoursChange: undefined,
    buyinsChange: undefined,
    dailyData: [],
    topPlayers: [],
    gameTypeBreakdown: []
  });

  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }
    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  const fetchAnalytics = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    try {
      // Convert period to days; fetch 2x to get previous period for comparison
      const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : 365;

      const [dailyRes, playersRes] = await Promise.all([
        fetch(`/api/commander/analytics/daily?venue_id=${venueId}&days=${periodDays * 2}`),
        fetch(`/api/commander/analytics/players?venue_id=${venueId}&limit=10`)
      ]);

      const dailyData = await dailyRes.json();
      const playersData = await playersRes.json();

      // API returns { analytics: [...], summary, period } and { players: [...], total, ... }
      const allDays = dailyData.analytics || [];
      const players = playersData.players || [];
      const totalPlayerCount = playersData.total || players.length;

      // allDays is sorted descending by date; split into current and previous periods
      const currentPeriod = allDays.slice(0, periodDays);
      const previousPeriod = allDays.slice(periodDays, periodDays * 2);

      // Aggregate current period stats
      const totalSessions = currentPeriod.reduce((sum, d) => sum + (d.total_sessions || 0), 0);
      const totalPlayHours = currentPeriod.reduce((sum, d) => sum + (parseFloat(d.total_play_hours) || 0), 0);
      const totalBuyin = currentPeriod.reduce((sum, d) => sum + (d.total_buyin || 0), 0);
      const curUniquePlayers = currentPeriod.reduce((sum, d) => sum + (d.unique_players || 0), 0);

      // Aggregate previous period stats for comparison
      const prevSessions = previousPeriod.reduce((sum, d) => sum + (d.total_sessions || 0), 0);
      const prevPlayHours = previousPeriod.reduce((sum, d) => sum + (parseFloat(d.total_play_hours) || 0), 0);
      const prevBuyin = previousPeriod.reduce((sum, d) => sum + (d.total_buyin || 0), 0);
      const prevUniquePlayers = previousPeriod.reduce((sum, d) => sum + (d.unique_players || 0), 0);

      // Calculate change percentages; returns null when no previous data (renders as "N/A")
      function calcChange(current, previous) {
        if (previous === 0) return null;
        return Math.round(((current - previous) / previous) * 100);
      }

      // Derive peak hour from the most frequent peak_hour weighted by sessions
      const peakHourWeights = {};
      currentPeriod.forEach(d => {
        if (d.peak_hour != null) {
          peakHourWeights[d.peak_hour] = (peakHourWeights[d.peak_hour] || 0) + (d.total_sessions || 1);
        }
      });
      let peakHour = '--';
      const peakEntries = Object.entries(peakHourWeights);
      if (peakEntries.length > 0) {
        const [topHourStr] = peakEntries.reduce((a, b) => (a[1] > b[1] ? a : b));
        const h = parseInt(topHourStr, 10);
        peakHour = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`;
      }

      // Game type breakdown from actual hours columns
      const nlheHours = currentPeriod.reduce((sum, d) => sum + (parseFloat(d.nlhe_hours) || 0), 0);
      const ploHours = currentPeriod.reduce((sum, d) => sum + (parseFloat(d.plo_hours) || 0), 0);
      const otherHours = currentPeriod.reduce((sum, d) => sum + (parseFloat(d.other_hours) || 0), 0);
      const gameTypeBreakdown = [];
      if (nlheHours > 0) gameTypeBreakdown.push({ label: 'NLHE', value: Math.round(nlheHours) });
      if (ploHours > 0) gameTypeBreakdown.push({ label: 'PLO', value: Math.round(ploHours) });
      if (otherHours > 0) gameTypeBreakdown.push({ label: 'Other', value: Math.round(otherHours) });

      setStats({
        totalPlayers: totalPlayerCount,
        totalSessions,
        totalHours: Math.round(totalPlayHours),
        totalBuyins: totalBuyin,
        avgSessionLength: totalSessions > 0 ? Math.round(totalPlayHours / totalSessions * 10) / 10 : 0,
        peakHour,
        playersChange: calcChange(curUniquePlayers, prevUniquePlayers),
        sessionsChange: calcChange(totalSessions, prevSessions),
        hoursChange: calcChange(totalPlayHours, prevPlayHours),
        buyinsChange: calcChange(totalBuyin, prevBuyin),
        dailyData: [...currentPeriod].reverse().slice(-7).map(d => ({
          label: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
          value: d.total_sessions || 0
        })),
        topPlayers: players.map(p => ({
          id: p.id,
          name: p.profiles?.display_name || p.display_name || 'Unknown',
          sessions: p.total_visits || 0,
          hours: Math.round(parseFloat(p.total_hours) || 0),
          buyins: p.total_buyin || 0
        })),
        gameTypeBreakdown
      });
    } catch (error) {
      console.error('Fetch analytics failed:', error);
      setStats({
        totalPlayers: 0,
        totalSessions: 0,
        totalHours: 0,
        totalBuyins: 0,
        avgSessionLength: 0,
        peakHour: '--',
        playersChange: undefined,
        sessionsChange: undefined,
        hoursChange: undefined,
        buyinsChange: undefined,
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
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Analytics | Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Analytics</h1>
                <p className="text-sm text-[#64748B]">Venue performance metrics</p>
              </div>
            </div>

            <div className="flex gap-2">
              {['week', 'month', 'year'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                    period === p
                      ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78] hover:bg-[#132240]'
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
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  title="Unique Players"
                  value={stats.totalPlayers}
                  change={stats.playersChange}
                  icon={Users}
                  color="#22D3EE"
                />
                <StatCard
                  title="Total Sessions"
                  value={stats.totalSessions}
                  change={stats.sessionsChange}
                  icon={Target}
                  color="#10B981"
                />
                <StatCard
                  title="Total Hours"
                  value={`${stats.totalHours}h`}
                  change={stats.hoursChange}
                  icon={Clock}
                  color="#8B5CF6"
                />
                <StatCard
                  title="Total Buy-ins"
                  value={`$${stats.totalBuyins.toLocaleString()}`}
                  change={stats.buyinsChange}
                  icon={DollarSign}
                  color="#F59E0B"
                />
              </div>

              {/* Charts Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Daily Sessions */}
                <div className="cmd-panel p-6">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-[#22D3EE]" />
                    Daily Sessions
                  </h3>
                  <SimpleBarChart data={stats.dailyData} label="Sessions" />
                </div>

                {/* Game Type Breakdown */}
                <div className="cmd-panel p-6">
                  <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#F59E0B]" />
                    Game Type Breakdown
                  </h3>
                  <SimpleBarChart data={stats.gameTypeBreakdown} label="Sessions" />
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="cmd-panel p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats.avgSessionLength}h</p>
                  <p className="text-sm text-[#64748B]">Avg Session</p>
                </div>
                <div className="cmd-panel p-4 text-center">
                  <p className="text-2xl font-bold text-white">{stats.peakHour}</p>
                  <p className="text-sm text-[#64748B]">Peak Hour</p>
                </div>
                <div className="cmd-panel p-4 text-center">
                  <p className="text-2xl font-bold text-white">
                    ${stats.totalSessions > 0 ? Math.round(stats.totalBuyins / stats.totalSessions) : 0}
                  </p>
                  <p className="text-sm text-[#64748B]">Avg Buy-in</p>
                </div>
                <div className="cmd-panel p-4 text-center">
                  <p className="text-2xl font-bold text-white">
                    {stats.totalPlayers > 0 ? (stats.totalSessions / stats.totalPlayers).toFixed(1) : 0}
                  </p>
                  <p className="text-sm text-[#64748B]">Sessions/Player</p>
                </div>
              </div>

              {/* Top Players */}
              <div className="cmd-panel">
                <div className="p-4 border-b border-[#4A5E78]">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#22D3EE]" />
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
