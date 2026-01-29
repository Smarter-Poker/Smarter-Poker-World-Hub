/**
 * Player Leaderboard Page
 * Public view of venue leaderboards and promotions
 * UI: Facebook color scheme, no emojis, Inter font
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
    <div className={`flex items-center gap-4 p-4 ${rank % 2 === 0 ? 'bg-[#F9FAFB]' : 'bg-white'}`}>
      <div className="w-10 text-center">
        {isTop3 ? (
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center mx-auto"
            style={{ backgroundColor: `${medalColors[rank]}20` }}
          >
            <Medal className="w-5 h-5" style={{ color: medalColors[rank] }} />
          </div>
        ) : (
          <span className="text-lg font-bold text-[#6B7280]">{rank}</span>
        )}
      </div>

      <div className="flex-1 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center overflow-hidden">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <Users className="w-5 h-5 text-[#1877F2]" />
          )}
        </div>
        <div>
          <p className={`font-medium ${isTop3 ? 'text-[#1F2937]' : 'text-[#374151]'}`}>
            {player.display_name || player.player_name || 'Anonymous'}
          </p>
          <p className="text-sm text-[#6B7280]">{player.sessions || 0} sessions</p>
        </div>
      </div>

      <div className="text-right">
        <p className={`text-lg font-bold ${isTop3 ? 'text-[#1877F2]' : 'text-[#1F2937]'}`}>
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
    <div className={`bg-white rounded-xl border p-4 ${isActive ? 'border-[#10B981]' : 'border-[#E5E7EB]'}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#F59E0B]" />
          <h3 className="font-semibold text-[#1F2937]">{promo.name}</h3>
        </div>
        {isActive && (
          <span className="px-2 py-1 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded">
            LIVE
          </span>
        )}
      </div>

      <p className="text-2xl font-bold text-[#10B981] mb-2">
        ${promo.prize_amount?.toLocaleString() || 0}
      </p>

      <div className="flex items-center gap-4 text-sm text-[#6B7280]">
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {promo.frequency}
        </span>
        <span>
          {promo.start_time?.slice(0, 5)} - {promo.end_time?.slice(0, 5)}
        </span>
      </div>

      {promo.description && (
        <p className="text-sm text-[#6B7280] mt-2">{promo.description}</p>
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
        fetch(`/api/club-commander/leaderboards/${venueId}?metric=${metric}&period=${period}`),
        fetch(`/api/club-commander/promotions?venue_id=${venueId}&active=true`),
        fetch(`/api/club-commander/venues/${venueId}`)
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
      console.error('Fetch failed:', error);
      // Mock data for demo
      setLeaderboard([
        { id: 1, display_name: 'PokerPro123', sessions: 28, total_hours: 112, total_buyins: 14500, points: 2800 },
        { id: 2, display_name: 'AceHunter', sessions: 24, total_hours: 96, total_buyins: 12000, points: 2400 },
        { id: 3, display_name: 'RiverRat', sessions: 22, total_hours: 88, total_buyins: 11000, points: 2200 },
        { id: 4, display_name: 'ChipStacker', sessions: 19, total_hours: 76, total_buyins: 9500, points: 1900 },
        { id: 5, display_name: 'BluffMaster', sessions: 17, total_hours: 68, total_buyins: 8500, points: 1700 },
        { id: 6, display_name: 'NittyNate', sessions: 15, total_hours: 60, total_buyins: 7500, points: 1500 },
        { id: 7, display_name: 'ActionJack', sessions: 14, total_hours: 56, total_buyins: 7000, points: 1400 },
        { id: 8, display_name: 'TiltMaster', sessions: 12, total_hours: 48, total_buyins: 6000, points: 1200 },
        { id: 9, display_name: 'FishCatcher', sessions: 11, total_hours: 44, total_buyins: 5500, points: 1100 },
        { id: 10, display_name: 'GrinderGary', sessions: 10, total_hours: 40, total_buyins: 5000, points: 1000 }
      ]);
      setPromotions([
        { id: 1, name: 'High Hand Bonus', prize_amount: 500, frequency: 'hourly', start_time: '10:00', end_time: '02:00', is_active: true },
        { id: 2, name: 'Bad Beat Jackpot', prize_amount: 25000, frequency: 'progressive', is_active: true, description: 'Quad 8s or better beaten' }
      ]);
      setVenue({ name: 'Demo Poker Room' });
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

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-4xl mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-8 h-8" />
              <h1 className="text-2xl font-bold">{venue?.name || 'Leaderboard'}</h1>
            </div>
            <p className="text-white/80">Top players this {period}</p>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Active Promotions */}
          {promotions.length > 0 && (
            <div>
              <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
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
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
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
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
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
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Trophy className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">No leaderboard data available</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB] bg-[#F9FAFB]">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-[#1F2937]">
                    Top {leaderboard.length} Players
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-[#6B7280]">
                    <TrendingUp className="w-4 h-4" />
                    By {METRICS.find(m => m.value === metric)?.label}
                  </div>
                </div>
              </div>

              <div className="divide-y divide-[#E5E7EB]">
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
