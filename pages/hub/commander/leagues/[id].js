/**
 * League Detail Page
 * View league standings, events, and join
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 * Per API_REFERENCE.md: GET /leagues/:id, GET /leagues/:id/standings
 */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { Trophy, Users, Calendar, ChevronLeft, Loader2, DollarSign, Clock } from 'lucide-react';
import { getAuthUser, getAccessToken, getFreshAccessToken } from '../../../../src/lib/authUtils';
import { usePersistedState } from '../../../../src/hooks/usePersistedState';
import { supabase } from '../../../../src/lib/supabase';
import CommanderPageShell, { commanderPageLayout } from '../../../../src/components/commander/CommanderPageShell';

function StandingRow({ entry, rank, isCurrentUser }) {
  return (
    <div className={`flex items-center justify-between p-3 ${isCurrentUser ? 'bg-[#22D3EE]/10 rounded-lg' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${rank === 1 ? 'bg-[#22D3EE] text-white' :
          rank === 2 ? 'bg-[#9CA3AF] text-white' :
            rank === 3 ? 'bg-[#3A8FC0] text-white' :
              'bg-[#0D192E] text-[#9FB3C8]'
          }`}>
          {rank}
        </div>
        <div>
          <p className={`font-medium ${isCurrentUser ? 'text-[#22D3EE]' : 'text-white'}`}>
            {entry.player_name}
            {isCurrentUser && <span className="text-xs ml-1">(You)</span>}
          </p>
          <p className="text-xs text-[#9FB3C8]">{entry.events_played} Events</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-white">{entry.points.toLocaleString()} Pts</p>
        {entry.earnings > 0 && (
          <p className="text-xs text-[#10B981]">${entry.earnings.toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}

function EventCard({ event }) {
  const isPast = new Date(event.date) < new Date();

  return (
    <div className={`p-3 rounded-lg border ${isPast ? 'bg-[#0D192E] border-[#445E77]' : 'bg-[#132240] border-[#22D3EE]'}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={`font-medium ${isPast ? 'text-[#9FB3C8]' : 'text-white'}`}>{event.name}</p>
          <p className="text-sm text-[#9FB3C8]">{event.venue_name}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${isPast ? 'bg-[#445E77]/10 text-[#8FA6BE]' : 'bg-[#22D3EE]/10 text-[#22D3EE]'
          }`}>
          {isPast ? 'Completed' : 'Upcoming'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-[#9FB3C8]">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {new Date(event.date).toLocaleDateString()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {event.time || 'TBD'}
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="w-4 h-4" />
          {event.buyin || 'Free'}
        </span>
      </div>
    </div>
  );
}

export default function LeagueDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = usePersistedState('sp-filters-commander-league-detail', 'standings');

  // Get current user ID from Supabase session (set by useEffect below)
  const [currentUserId, setCurrentUserId] = React.useState(null);
  React.useEffect(() => {
    if (!router.isReady) return;
    const authUser = getAuthUser();
    if (authUser?.id) setCurrentUserId(authUser.id);
  }, [router.isReady]);

  // SWR - parallel fetch of league details + standings
  const swrKey = id ? `/api/commander/leagues/${id}` : null;
  const { data: swrData, isLoading: loading, mutate: refreshLeague } = useSWR(swrKey, async () => {
    const token = getAccessToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const [leagueRes, standingsRes] = await Promise.all([
      fetch(`/api/commander/leagues/${id}`, { headers }).catch(() => ({ ok: false })),
      fetch(`/api/commander/leagues/${id}/standings`, { headers }).catch(() => ({ ok: false }))
    ]);
    if (!leagueRes.ok) throw new Error(`Request failed (${leagueRes.status})`);
    const [leagueData, standingsData] = await Promise.all([leagueRes.json(), standingsRes.json()]);
    if (leagueData.success) setIsJoined(leagueData.data?.is_joined || false);
    return {
      league: leagueData.success ? leagueData.data?.league : null,
      events: leagueData.success ? (leagueData.data?.events || []) : [],
      standings: standingsData.success ? (standingsData.data?.standings || []) : []
    };
  });
  const league = swrData?.league || null;
  const standings = swrData?.standings || [];
  const events = swrData?.events || [];

  // Realtime listener - live updates for league detail
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`league-detail:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_leagues', filter: `id=eq.${id}` }, () => { refreshLeague(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, refreshLeague]);

  async function handleJoinLeague() {
    setJoining(true);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        router.push(`/auth/login?redirect=/hub/commander/leagues/${id}`);
        return;
      }

      const res = await fetch(`/api/commander/leagues/${id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        setIsJoined(true);
        refreshLeague();
      }
    } catch (err) {
      console.warn('Join failed:', err);
    } finally {
      setJoining(false);
    }
  }

  const myRank = currentUserId ? standings.findIndex(s => s.player_id === currentUserId) + 1 : 0;

  if (loading) return <div style={{ padding: 40 }}><SkeletonLoader variant="card" count={3} /></div>;

  if (!league) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <p className="text-[#9FB3C8]">League Not Found</p>
      </div>
    );
  }

  return (
    <CommanderPageShell>
    <>
      <SEOHead
        title="League Details"
        description="Smarter.Poker - The Future Of The Game."
        noindex={true}
      />

      <div className="cmd-page">
        {/* Header */}
        <div className="cmd-back-row">
          <button type="button" className="cmd-back-link"
            onClick={() => router.back()}
            >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
            Back
          </button>
        </div>
        <header className="cmd-header-full text-white">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="cmd-icon-box cmd-icon-box-glow">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{league.name}</h1>
                <p className="text-white/80 text-sm">{league.organizer_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {league.player_count} Players
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {league.events_count} Events
              </span>
              {league.prize_pool > 0 && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  ${league.prize_pool.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* My Position (if joined) */}
        {isJoined && myRank > 0 && (
          <div className="max-w-lg mx-auto px-4 -mt-4">
            <div className="cmd-panel p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#9FB3C8]">Your Position</p>
                  <p className="text-2xl font-bold text-white">#{myRank}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#9FB3C8]">Points</p>
                  <p className="text-2xl font-bold text-[#22D3EE]">
                    {standings[myRank - 1]?.points.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Description */}
          <section className="cmd-panel p-4">
            <p className="text-[#9FB3C8]">{league.description}</p>
            <div className="flex items-center gap-2 mt-3 text-sm text-[#8FA6BE]">
              <Calendar className="w-4 h-4" />
              {new Date(league.season_start).toLocaleDateString()} - {new Date(league.season_end).toLocaleDateString()}
            </div>
          </section>

          {/* Join Button */}
          {!isJoined && (
            <button
              onClick={handleJoinLeague}
              disabled={joining}
              className="cmd-btn cmd-btn-primary w-full h-14 text-lg font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join League'}
            </button>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[#445E77]">
            {[
              { key: 'standings', label: 'Standings' },
              { key: 'events', label: 'Events' },
              { key: 'scoring', label: 'Scoring' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                  ? 'border-[#22D3EE] text-[#22D3EE]'
                  : 'border-transparent text-[#9FB3C8]'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Standings Tab */}
          {activeTab === 'standings' && (
            <section className="cmd-panel overflow-hidden">
              {standings.length > 0 ? (
                <div className="divide-y divide-[#445E77]">
                  {standings.map((entry, index) => (
                    <StandingRow
                      key={entry.player_id}
                      entry={entry}
                      rank={index + 1}
                      isCurrentUser={entry.player_id === currentUserId}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-[#9FB3C8]">
                  No Standings Yet
                </div>
              )}
            </section>
          )}

          {/* Events Tab */}
          {activeTab === 'events' && (
            <section className="space-y-3">
              {events.length > 0 ? (
                events
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map(event => (
                    <EventCard key={event.id} event={event} />
                  ))
              ) : (
                <div className="cmd-panel p-6 text-center text-[#9FB3C8]">
                  No Events Scheduled
                </div>
              )}
            </section>
          )}

          {/* Scoring Tab */}
          {activeTab === 'scoring' && (
            <section className="cmd-panel p-4">
              <h3 className="font-semibold text-white mb-3">Points System</h3>
              {league.scoring_system ? (
                <div className="space-y-2">
                  {Object.entries(league.scoring_system || {}).map(([place, points]) => (
                    <div key={place} className="flex items-center justify-between py-2 border-b border-[#445E77] last:border-0">
                      <span className="text-[#9FB3C8]">{place}</span>
                      <span className="font-medium text-white">{points} Pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#9FB3C8]">Scoring Details Not Available</p>
              )}
            </section>
          )}
        </main>
      </div>
    </>
    </CommanderPageShell>
  );
}

LeagueDetailPage.getLayout = commanderPageLayout;
