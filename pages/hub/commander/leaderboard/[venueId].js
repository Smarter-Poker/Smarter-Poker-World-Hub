/**
 * Player Leaderboard Page
 * Public view of venue leaderboards and promotions
 * Dark industrial sci-fi gaming theme
 */
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import { usePersistedFilters } from '../../../../src/hooks/usePersistedFilters';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { Trophy, Clock, DollarSign, Medal, Star, Calendar } from 'lucide-react';
import LeaderboardDisplay from '../../../../src/components/commander/leaderboards/LeaderboardDisplay';
import { supabase } from '../../../../src/lib/supabase';
import CommanderPageShell from '../../../../src/components/commander/CommanderPageShell';

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

  const { filters, setFilter } = usePersistedFilters('commander-leaderboard', { metric: 'hours', period: 'month' });
  const metric = filters.metric;
  const period = filters.period;
  const setMetric = (v) => setFilter('metric', v);
  const setPeriod = (v) => setFilter('period', v);
  const [selectedLeaderboard, setSelectedLeaderboard] = useState(null);

  // SWR — parallel fetch, re-fires when metric/period/venueId changes
  // 2026-07-25 audit fix: /api/commander/leaderboards/{id} takes a LEADERBOARD
  // id, not a venue id, and returns {leaderboard, entries, total_entries} with
  // no success flag. List the venue's boards first, pick the first active one,
  // then fetch its entries by leaderboard id.
  const swrKey = venueId ? `/api/commander/leaderboards?venue_id=${venueId}&metric=${metric}&period=${period}` : null;
  const { data: swrData, isLoading: loading, mutate: refreshLeaderboard } = useSWR(swrKey, async () => {
    const safeJson = async (res) => (res && res.ok && typeof res.json === 'function') ? res.json().catch(() => ({})) : {};
    const [listRes, promosRes, venueRes] = await Promise.all([
      fetch(`/api/commander/leaderboards?venue_id=${venueId}&status=active`).catch(() => ({ ok: false })),
      fetch(`/api/commander/promotions?venue_id=${venueId}&active=true`).catch(() => ({ ok: false })),
      fetch(`/api/commander/venues/${venueId}`).catch(() => ({ ok: false }))
    ]);
    if (!listRes.ok) throw new Error(`Request failed (${listRes.status || 'network'})`);
    const [ls, pr, vn] = await Promise.all([safeJson(listRes), safeJson(promosRes), safeJson(venueRes)]);
    const boards = ls.leaderboards || ls.data?.leaderboards || [];
    const board = boards.find(b => b.status === 'active') || boards[0] || null;

    let entries = [];
    if (board?.id) {
      const detailRes = await fetch(`/api/commander/leaderboards/${board.id}`).catch(() => ({ ok: false }));
      if (detailRes.ok) {
        const detail = await detailRes.json().catch(() => ({}));
        entries = Array.isArray(detail.entries) ? detail.entries : [];
      }
    }

    return {
      leaderboard: entries,
      promotions: pr.success ? (pr.data?.promotions || []) : [],
      venue: vn.success || vn.venue ? (vn.venue || vn.data?.venue) : null,
      leaderboardsList: boards
    };
  });
  const leaderboard = swrData?.leaderboard || [];
  const promotions = swrData?.promotions || [];
  const venue = swrData?.venue || null;
  const leaderboardsList = swrData?.leaderboardsList || [];

  // Realtime listener — live updates for venue leaderboard
  useEffect(() => {
    if (!venueId) return;
    const ch = supabase
      .channel(`lb:${venueId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_checkins', filter: `venue_id=eq.${venueId}` }, () => { refreshLeaderboard(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_leaderboard_entries' }, () => { refreshLeaderboard(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [venueId, refreshLeaderboard]);

  const METRICS = [
    { value: 'hours', label: 'Hours Played', icon: Clock },
    { value: 'sessions', label: 'Sessions', icon: Calendar },
    { value: 'buyins', label: 'Buy-ins', icon: DollarSign },
    { value: 'points', label: 'Points', icon: Star }
  ];


  if (!router.isReady) return null;

  return (
    <CommanderPageShell>
    <>
      <SEOHead
        title="Venue Leaderboard"
        description="Smarter.Poker — The Future Of The Game."
        noindex={true}
      />

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
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${selectedLeaderboard?.id === lb.id
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
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${period === p
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
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${metric === value
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
          {(loading) ? (<div style={{ padding: 24 }}><SkeletonLoader variant="leaderboard" rows={8} /></div>) : leaderboard.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Trophy className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#64748B]">No Leaderboard Data Available</p>
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
                // 2026-07-25 audit fix: real entries rows already carry rank,
                // score and a nested profiles object — prefer those, keep the
                // old flat fields as fallbacks, default missing numbers to 0.
                id: player.id,
                rank: player.rank ?? idx + 1,
                player_id: player.player_id || player.id,
                profiles: player.profiles || {
                  display_name: player.display_name || player.player_name,
                  avatar_url: player.avatar_url
                },
                hours_played: player.hours_played ?? player.total_hours ?? 0,
                sessions_count: player.sessions_count ?? player.sessions ?? 0,
                points_earned: player.points_earned ?? player.points ?? 0,
                score: player.score ?? player.total_buyins ?? 0
              }))}
            />
          )}
        </main>
      </div>
    </>
    </CommanderPageShell>
  );
}
