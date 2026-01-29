/**
 * Player Leaderboard Page
 * Public view of venue leaderboards and promotions
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Trophy,
  Clock,
  DollarSign,
  Users,
  Medal,
  Star,
  TrendingUp,
  Calendar,
  Loader2
} from 'lucide-react';

function LeaderboardRow({ player, rank, metric }) {
  const isTop3 = rank <= 3;
  const medalColors = {
    1: '#F59E0B',
    2: '#9CA3AF',
    3: '#B45309'
  };

  return (
    <div className={`flex items-center gap-4 p-4 ${rank % 2 === 0 ? 'bg-[#0F1C32]' : 'bg-[#132240]'}`}>
      <div className="w-10 text-center">
        {isTop3 ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: `${medalColors[rank]}20` }}
          >
            <Medal className="w-5 h-5" style={{ color: medalColors[rank] }} />
          </div>
        ) : (
          <span className="text-lg font-bold text-[#64748B]">{rank}</span>
        )}
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center overflow-hidden">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <Users className="w-5 h-5 text-[#22D3EE]" />
          )}
        </div>
        <div>
          <p className={`font-medium ${isTop3 ? 'text-white' : 'text-white'}`}>
            {player.display_name || player.player_name || 'Anonymous'}
          </p>
          <p className="text-sm text-[#64748B]">{player.sessions || 0} sessions</p>
        </div>
      </div>

      <div className="text-right">
        <p className={`text-lg font-bold ${isTop3 ? 'text-[#22D3EE]' : 'text-white'}`}>
          {metric === 'hours' && `${player.total_hours || 0}h`}
          {metric === 'sessions' && (player.sessions || 0)}
          {metric === 'buyins' && `$${(player.total_buyins || 0).toLocaleString()}`}
          {metric === 'points' && (player.points || 0).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function PromotionCard({ promo }) {
  const isActive = promo.is_active;

  return (
    <div className={`cmd-panel ${isActive ? 'border-[#10B981]' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F59E0B]" />
          <h3 className="font-semibold text-white">{promo.name}</h3>
        </div>
        {isActive && (
          <span className="cmd-badge cmd-badge-live">
            LIVE
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-[#10B981] mb-2">
        ${promo.prize_amount?.toLocaleString() || 0}
      </p>

      <div className="flex items-center gap-4 text-sm text-[#64748B]">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {promo.frequency}
        </span>
        <span>
          {promo.start_time?.slice(0, 5)} - {promo.end_time?.slice(0, 5)}
        </span>
      </div>

      {promo.description && (
        <p className="text-sm text-[#64748B] mt-2">{promo.description}</p>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const router = useRouter();
  const { venueId } = router.query;

  const [venue, setVenue] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState('hours');
  const [period, setPeriod] = useState('month');

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    try {
      const [leaderboardRes, promosRes, venueRes] = await Promise.all([
        fetch(`/api/commander/leaderboards/${venueId}?metric=${metric}&period=${period}`),
        fetch(`/api/commander/promotions?venue_id=${venueId}&active=true`),
        fetch(`/api/commander/venues/${venueId}`)
      ]);

      const leaderboardData = await leaderboardRes.json();
      const promosData = await promosRes.json();
      const venueData = await venueRes.json();

      if (leaderboardData.success) {
        setLeaderboard(leaderboardData.data?.entries || []);
      }
      if (promosData.success) {
        setPromotions(promosData.data?.promotions || []);
      }
      if (venueData.success || venueData.venue) {
        setVenue(venueData.venue || venueData.data?.venue);
      }
    } catch (error) {
      console.error('Fetch leaderboard failed:', error);
      setLeaderboard([]);
      setPromotions([]);
      setVenue(null);
    } finally {
      setLoading(false);
    }
  }, [venueId, metric, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const METRICS = [
    { value: 'hours', label: 'Hours Played', icon: Clock },
    { value: 'sessions', label: 'Sessions', icon: Calendar },
    { value: 'buyins', label: 'Buy-ins', icon: DollarSign },
    { value: 'points', label: 'Points', icon: Star }
  ];

  return (
    <>
      <Head>
        <title>Leaderboard | {venue?.name || 'Poker Room'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full text-white">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="cmd-icon-box cmd-icon-box-glow">
                <Trophy className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold">{venue?.name || 'Leaderboard'}</h1>
            </div>
            <p className="text-white/80">Top players this {period}</p>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Active Promotions */}
          {promotions.length > 0 && (
            <div>
              <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-3 flex items-center gap-2">
                <Star className="w-5 h-5 text-[#F59E0B]" />
                Active Promotions
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {promotions.map((promo) => (
                  <PromotionCard key={promo.id} promo={promo} />
                ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex gap-2">
              {['week', 'month', 'year', 'all'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                    period === p
                      ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78] hover:text-white'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              {METRICS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setMetric(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    metric === value
                      ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Trophy className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#64748B]">No leaderboard data available</p>
            </div>
          ) : (
            <div className="cmd-panel !p-0 overflow-hidden">
              <div className="p-4 border-b border-[#4A5E78] bg-[#0D192E]">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white uppercase tracking-wide text-sm">
                    Top {leaderboard.length} Players
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-[#64748B]">
                    <TrendingUp className="w-4 h-4" />
                    By {METRICS.find(m => m.value === metric)?.label}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#4A5E78]">
                {leaderboard.map((player, index) => (
                  <LeaderboardRow
                    key={player.id}
                    player={player}
                    rank={index + 1}
                    metric={metric}
                  />
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
