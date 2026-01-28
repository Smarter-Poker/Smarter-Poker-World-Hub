/**
 * League Detail Page
 * View league standings, events, and join
 * UI: Facebook color scheme, no emojis, Inter font
 * Per API_REFERENCE.md: GET /leagues/:id, GET /leagues/:id/standings
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Trophy,
  Users,
  Calendar,
  ChevronLeft,
  Loader2,
  Award,
  DollarSign,
  TrendingUp,
  Medal,
  Clock,
  MapPin
} from 'lucide-react';

function StandingRow({ entry, rank, isCurrentUser }) {
  return (
    <div className={`flex items-center justify-between p-3 ${isCurrentUser ? 'bg-[#1877F2]/5 rounded-lg' : ''}`}>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          rank === 1 ? 'bg-[#F59E0B] text-white' :
          rank === 2 ? 'bg-[#9CA3AF] text-white' :
          rank === 3 ? 'bg-[#CD7F32] text-white' :
          'bg-[#F3F4F6] text-[#6B7280]'
        }`}>
          {rank}
        </div>
        <div>
          <p className={`font-medium ${isCurrentUser ? 'text-[#1877F2]' : 'text-[#1F2937]'}`}>
            {entry.player_name}
            {isCurrentUser && <span className="text-xs ml-1">(You)</span>}
          </p>
          <p className="text-xs text-[#6B7280]">{entry.events_played} events</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-[#1F2937]">{entry.points.toLocaleString()} pts</p>
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
    <div className={`p-3 rounded-lg border ${isPast ? 'bg-[#F9FAFB] border-[#E5E7EB]' : 'bg-white border-[#1877F2]'}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className={`font-medium ${isPast ? 'text-[#6B7280]' : 'text-[#1F2937]'}`}>{event.name}</p>
          <p className="text-sm text-[#6B7280]">{event.venue_name}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          isPast ? 'bg-[#6B7280]/10 text-[#6B7280]' : 'bg-[#1877F2]/10 text-[#1877F2]'
        }`}>
          {isPast ? 'Completed' : 'Upcoming'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-[#6B7280]">
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

  const [loading, setLoading] = useState(true);
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [events, setEvents] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [activeTab, setActiveTab] = useState('standings');
  const [currentUserId, setCurrentUserId] = useState(null);

  useEffect(() => {
    // Get current user ID from token
    const token = localStorage.getItem('smarter-poker-auth');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.sub);
      } catch (e) {
        console.error('Failed to decode token:', e);
      }
    }
    if (id) {
      fetchLeagueData();
    }
  }, [id]);

  async function fetchLeagueData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [leagueRes, standingsRes] = await Promise.all([
        fetch(`/api/captain/leagues/${id}`, { headers }),
        fetch(`/api/captain/leagues/${id}/standings`, { headers })
      ]);

      const leagueData = await leagueRes.json();
      const standingsData = await standingsRes.json();

      if (leagueData.success) {
        setLeague(leagueData.data?.league);
        setEvents(leagueData.data?.events || []);
        setIsJoined(leagueData.data?.is_joined || false);
      }
      if (standingsData.success) {
        setStandings(standingsData.data?.standings || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setLeague(null);
      setStandings([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinLeague() {
    setJoining(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push(`/login?redirect=/hub/captain/leagues/${id}`);
        return;
      }

      const res = await fetch(`/api/captain/leagues/${id}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        setIsJoined(true);
        fetchLeagueData();
      }
    } catch (err) {
      console.error('Join failed:', err);
    } finally {
      setJoining(false);
    }
  }

  const myRank = currentUserId ? standings.findIndex(s => s.player_id === currentUserId) + 1 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!league) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <p className="text-[#6B7280]">League not found</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{league.name} | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
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
                {league.player_count} players
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {league.events_count} events
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
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#6B7280]">Your Position</p>
                  <p className="text-2xl font-bold text-[#1F2937]">#{myRank}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-[#6B7280]">Points</p>
                  <p className="text-2xl font-bold text-[#1877F2]">
                    {standings[myRank - 1]?.points.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Description */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <p className="text-[#6B7280]">{league.description}</p>
            <div className="flex items-center gap-2 mt-3 text-sm text-[#9CA3AF]">
              <Calendar className="w-4 h-4" />
              {new Date(league.season_start).toLocaleDateString()} - {new Date(league.season_end).toLocaleDateString()}
            </div>
          </section>

          {/* Join Button */}
          {!isJoined && (
            <button
              onClick={handleJoinLeague}
              disabled={joining}
              className="w-full h-14 bg-[#1877F2] text-white text-lg font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join League'}
            </button>
          )}

          {/* Tabs */}
          <div className="flex border-b border-[#E5E7EB]">
            {[
              { key: 'standings', label: 'Standings' },
              { key: 'events', label: 'Events' },
              { key: 'scoring', label: 'Scoring' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-[#1877F2] text-[#1877F2]'
                    : 'border-transparent text-[#6B7280]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Standings Tab */}
          {activeTab === 'standings' && (
            <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              {standings.length > 0 ? (
                <div className="divide-y divide-[#E5E7EB]">
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
                <div className="p-6 text-center text-[#6B7280]">
                  No standings yet
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
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 text-center text-[#6B7280]">
                  No events scheduled
                </div>
              )}
            </section>
          )}

          {/* Scoring Tab */}
          {activeTab === 'scoring' && (
            <section className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <h3 className="font-semibold text-[#1F2937] mb-3">Points System</h3>
              {league.scoring_system ? (
                <div className="space-y-2">
                  {Object.entries(league.scoring_system).map(([place, points]) => (
                    <div key={place} className="flex items-center justify-between py-2 border-b border-[#E5E7EB] last:border-0">
                      <span className="text-[#6B7280]">{place}</span>
                      <span className="font-medium text-[#1F2937]">{points} pts</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#6B7280]">Scoring details not available</p>
              )}
            </section>
          )}
        </main>
      </div>
    </>
  );
}
