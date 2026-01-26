/**
 * Player Leagues Page
 * Browse and join poker leagues
 * UI: Facebook color scheme, no emojis, Inter font
 * Per API_REFERENCE.md: /leagues endpoints
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Trophy,
  Users,
  Calendar,
  MapPin,
  ChevronRight,
  Search,
  Loader2,
  Star,
  Award,
  DollarSign
} from 'lucide-react';

function LeagueCard({ league, onView }) {
  const statusColors = {
    upcoming: 'bg-[#1877F2]/10 text-[#1877F2]',
    active: 'bg-[#10B981]/10 text-[#10B981]',
    completed: 'bg-[#6B7280]/10 text-[#6B7280]'
  };

  return (
    <button
      onClick={() => onView(league.id)}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#F59E0B]/10 rounded-xl flex items-center justify-center">
            <Trophy className="w-6 h-6 text-[#F59E0B]" />
          </div>
          <div>
            <h3 className="font-semibold text-[#1F2937]">{league.name}</h3>
            <p className="text-sm text-[#6B7280]">{league.organizer_name || 'League Organizer'}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${statusColors[league.status] || statusColors.upcoming}`}>
          {league.status}
        </span>
      </div>

      <p className="text-sm text-[#6B7280] mb-3 line-clamp-2">{league.description}</p>

      <div className="flex items-center gap-4 text-sm text-[#6B7280] mb-3">
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {league.player_count || 0} players
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {league.events_count || 0} events
        </span>
        {league.prize_pool > 0 && (
          <span className="flex items-center gap-1 text-[#10B981]">
            <DollarSign className="w-4 h-4" />
            {league.prize_pool.toLocaleString()}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#9CA3AF]">
          {league.season_start ? new Date(league.season_start).toLocaleDateString() : 'TBD'} - {league.season_end ? new Date(league.season_end).toLocaleDateString() : 'TBD'}
        </span>
        <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
      </div>
    </button>
  );
}

function MyLeagueCard({ league, onView }) {
  return (
    <button
      onClick={() => onView(league.id)}
      className="w-full bg-gradient-to-r from-[#1877F2] to-[#1665D8] rounded-xl p-4 text-left text-white"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{league.name}</h3>
        <span className="px-2 py-1 bg-white/20 rounded text-xs">
          Rank #{league.my_rank || '--'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-white/80">
        <span>{league.my_points || 0} pts</span>
        <span>{league.events_played || 0} events played</span>
      </div>
    </button>
  );
}

export default function LeaguesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [leagues, setLeagues] = useState([]);
  const [myLeagues, setMyLeagues] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchLeagues();
  }, []);

  async function fetchLeagues() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const [allRes, myRes] = await Promise.all([
        fetch('/api/captain/leagues'),
        token ? fetch('/api/captain/leagues/my', {
          headers: { Authorization: `Bearer ${token}` }
        }) : Promise.resolve({ json: () => ({ success: false }) })
      ]);

      const allData = await allRes.json();
      const myData = await myRes.json();

      if (allData.success) {
        setLeagues(allData.data?.leagues || []);
      }
      if (myData.success) {
        setMyLeagues(myData.data?.leagues || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      // Mock data
      setLeagues([
        {
          id: 1,
          name: 'Texas Poker Championship',
          description: 'Monthly tournament series across Texas card rooms with points-based standings.',
          organizer_name: 'Texas Poker Tour',
          status: 'active',
          player_count: 156,
          events_count: 12,
          prize_pool: 50000,
          season_start: '2026-01-01',
          season_end: '2026-06-30'
        },
        {
          id: 2,
          name: 'Las Vegas Grinders League',
          description: 'Weekly cash game leaderboard for hours played and session wins.',
          organizer_name: 'LV Poker Club',
          status: 'active',
          player_count: 89,
          events_count: 24,
          prize_pool: 25000,
          season_start: '2026-01-01',
          season_end: '2026-03-31'
        },
        {
          id: 3,
          name: 'Spring Freeroll Series',
          description: 'Free entry tournaments with guaranteed prize pools.',
          organizer_name: 'Smarter Poker',
          status: 'upcoming',
          player_count: 42,
          events_count: 8,
          prize_pool: 10000,
          season_start: '2026-03-01',
          season_end: '2026-05-31'
        }
      ]);
      setMyLeagues([
        {
          id: 1,
          name: 'Texas Poker Championship',
          my_rank: 23,
          my_points: 1250,
          events_played: 5
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleViewLeague(leagueId) {
    router.push(`/hub/captain/leagues/${leagueId}`);
  }

  const filteredLeagues = leagues
    .filter(l => {
      if (filter === 'active') return l.status === 'active';
      if (filter === 'upcoming') return l.status === 'upcoming';
      return true;
    })
    .filter(l =>
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <>
      <Head>
        <title>Leagues | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Trophy className="w-6 h-6" />
              Poker Leagues
            </h1>
            <p className="text-white/80 text-sm mt-1">Compete for points and prizes</p>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* My Leagues */}
          {myLeagues.length > 0 && (
            <section>
              <h2 className="font-semibold text-[#1F2937] mb-3">My Leagues</h2>
              <div className="space-y-3">
                {myLeagues.map(league => (
                  <MyLeagueCard
                    key={league.id}
                    league={league}
                    onView={handleViewLeague}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Search & Filter */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leagues..."
                className="w-full h-12 pl-12 pr-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'upcoming', label: 'Upcoming' }
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    filter === f.value
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#6B7280]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Leagues List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : filteredLeagues.length > 0 ? (
            <section>
              <h2 className="font-semibold text-[#1F2937] mb-3">
                {filter === 'all' ? 'All Leagues' : filter === 'active' ? 'Active Leagues' : 'Upcoming Leagues'}
              </h2>
              <div className="space-y-3">
                {filteredLeagues.map(league => (
                  <LeagueCard
                    key={league.id}
                    league={league}
                    onView={handleViewLeague}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Trophy className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">No leagues found</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
