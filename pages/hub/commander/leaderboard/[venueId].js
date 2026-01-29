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
import LeaderboardDisplay from '../../../../src/components/commander/leaderboards/LeaderboardDisplay';

/* Inline LeaderboardRow replaced by shared LeaderboardDisplay component */

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
  const [leaderboardsList, setLeaderboardsList] = useState([]);
  const [selectedLeaderboard, setSelectedLeaderboard] = useState(null);

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);

    try {
      const [leaderboardRes, promosRes, venueRes, leaderboardsListRes] = await Promise.all([
        fetch(`/api/commander/leaderboards/${venueId}?metric=${metric}&period=${period}`),
        fetch(`/api/commander/promotions?venue_id=${venueId}&active=true`),
        fetch(`/api/commander/venues/${venueId}`),
        fetch(`/api/commander/leaderboards?venue_id=${venueId}&status=active`)
      ]);

      const leaderboardData = await leaderboardRes.json();
      const promosData = await promosRes.json();
      const venueData = await venueRes.json();
      const leaderboardsListData = await leaderboardsListRes.json();

      if (leaderboardData.success) {
        setLeaderboard(leaderboardData.data?.entries || []);
      }
      if (promosData.success) {
        setPromotions(promosData.data?.promotions || []);
      }
      if (venueData.success || venueData.venue) {
        setVenue(venueData.venue || venueData.data?.venue);
      }
      if (leaderboardsListData.leaderboards) {
        setLeaderboardsList(leaderboardsListData.leaderboards);
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

          {/* Available Leaderboards */}
          {leaderboardsList.length > 0 && (
            <div>
              <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-3 flex items-center gap-2">
                <Medal className="w-5 h-5 text-[#22D3EE]" />
                Available Leaderboards
              </h2>
              <div className="flex flex-wrap gap-2">
                {leaderboardsList.map((lb) => (
                  <button
                    key={lb.id}
                    onClick={() => setSelectedLeaderboard(
                      selectedLeaderboard?.id === lb.id ? null : lb
                    )}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      selectedLeaderboard?.id === lb.id
                        ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                        : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78] hover:text-white'
                    }`}
                  >
                    <span>{lb.name}</span>
                    {lb.period_type && (
                      <span className="text-xs text-[#4A5E78] ml-1">({lb.period_type})</span>
                    )}
                  </button>
                ))}
              </div>
              {selectedLeaderboard?.description && (
                <p className="text-sm text-[#64748B] mt-2">{selectedLeaderboard.description}</p>
              )}
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
            <LeaderboardDisplay
              leaderboard={{
                name: `${venue?.name || 'Venue'} Leaderboard`,
                status: 'active',
                leaderboard_type: metric === 'hours' ? 'hours_played' : metric === 'points' ? 'tournament_points' : metric,
                description: `Top players this ${period}`
              }}
              entries={leaderboard.map((player, idx) => ({
                id: player.id,
                rank: idx + 1,
                player_id: player.id,
                profiles: {
                  display_name: player.display_name || player.player_name,
                  avatar_url: player.avatar_url
                },
                hours_played: player.total_hours || 0,
                sessions_count: player.sessions || 0,
                points_earned: player.points || 0,
                score: player.total_buyins || 0
              }))}
            />
          )}
        </main>
      </div>
    </>
  );
}
