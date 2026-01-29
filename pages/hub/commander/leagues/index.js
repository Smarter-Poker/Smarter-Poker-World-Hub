/**
 * Player Leagues Page
 * Browse and join poker leagues
 * UI: Dark industrial sci-fi gaming UI with metallic chrome frames
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
  const statusConfig = {
    upcoming: { className: 'cmd-badge cmd-badge-primary', label: 'upcoming' },
    active: { className: 'cmd-badge cmd-badge-live', label: 'active' },
    completed: { className: 'cmd-badge cmd-badge-chrome', label: 'completed' }
  };

  const badge = statusConfig[league.status] || statusConfig.upcoming;

  return (
    <button
      onClick={() => onView(league.id)}
      className="w-full cmd-panel cmd-corner-lights p-4 text-left hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all group"
    >
      {/* Corner glow lights */}
      <span className="cmd-light cmd-light-tl" />
      <span className="cmd-light cmd-light-br" />

      {/* Rivets */}
      <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
      <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="cmd-icon-box w-12 h-12">
            <Trophy className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white">{league.name}</h3>
            <p className="text-sm text-[#64748B]">{league.organizer_name || 'League Organizer'}</p>
          </div>
        </div>
        <span className={`${badge.className} capitalize`}>
          {league.status}
        </span>
      </div>

      <p className="text-sm text-[#64748B] mb-3 line-clamp-2">{league.description}</p>

      <div className="flex items-center gap-4 text-sm text-[#64748B] mb-3">
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
        <span className="text-sm text-[#64748B]">
          {league.season_start ? new Date(league.season_start).toLocaleDateString() : 'TBD'} - {league.season_end ? new Date(league.season_end).toLocaleDateString() : 'TBD'}
        </span>
        <ChevronRight className="w-5 h-5 text-[#64748B]" />
      </div>
    </button>
  );
}

function MyLeagueCard({ league, onView }) {
  return (
    <button
      onClick={() => onView(league.id)}
      className="w-full cmd-panel p-4 text-left text-white border-[#22D3EE]/30 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{league.name}</h3>
        <span className="px-2 py-1 bg-[#22D3EE]/20 rounded text-xs text-[#22D3EE]">
          Rank #{league.my_rank || '--'}
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-[#CBD5E1]">
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
        fetch('/api/commander/leagues'),
        token ? fetch('/api/commander/leagues/my', {
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
      console.error('Fetch leagues failed:', err);
      setLeagues([]);
      setMyLeagues([]);
    } finally {
      setLoading(false);
    }
  }

  function handleViewLeague(leagueId) {
    router.push(`/hub/commander/leagues/${leagueId}`);
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

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-4">
              <div className="cmd-icon-box cmd-icon-box-glow w-14 h-14">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-wider cmd-text-glow">
                  POKER LEAGUES
                </h1>
                <p className="text-sm text-[#64748B] font-medium tracking-wide">Compete for points and prizes</p>
              </div>
              {/* Rivets */}
              <div className="ml-auto flex gap-2">
                <span className="cmd-rivet" />
                <span className="cmd-rivet" />
                <span className="cmd-rivet" />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* My Leagues */}
          {myLeagues.length > 0 && (
            <section>
              <h2 className="font-semibold text-white mb-3">My Leagues</h2>
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
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leagues..."
                className="cmd-input pl-12"
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
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    filter === f.value
                      ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                      : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78]'
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
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : filteredLeagues.length > 0 ? (
            <section>
              <h2 className="font-semibold text-white mb-3">
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
            <div className="cmd-panel p-8 text-center">
              <div className="cmd-icon-box mx-auto mb-3">
                <Trophy className="w-7 h-7" />
              </div>
              <p className="text-[#64748B]">No leagues found</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
