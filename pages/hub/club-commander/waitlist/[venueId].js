/**
 * Player Waitlist Join Page - Public page for players to join waitlist
 * URL: /hub/club-commander/waitlist/[venueId]
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Clock, Users, CheckCircle, MapPin, ChevronRight, Loader2 } from 'lucide-react';

const GAME_TYPES = [
  { value: 'nlh', label: 'No Limit Hold\'em', short: 'NLH' },
  { value: 'plo', label: 'Pot Limit Omaha', short: 'PLO' },
  { value: 'plo5', label: 'PLO Hi-Lo', short: 'PLO5' },
  { value: 'mixed', label: 'Mixed Games', short: 'MIX' },
  { value: 'limit', label: 'Limit Hold\'em', short: 'LHE' }
];

export default function PlayerWaitlistPage() {
  const router = useRouter();
  const { venueId } = router.query;

  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [myEntries, setMyEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Fetch venue data
  useEffect(() => {
    if (venueId) {
      fetchData();
      const interval = setInterval(fetchData, 30000);
      return () => clearInterval(interval);
    }
  }, [venueId]);

  async function fetchData() {
    try {
      const [venueRes, gamesRes, waitlistRes, myRes] = await Promise.all([
        fetch(`/api/club-commander/venues/${venueId}`),
        fetch(`/api/club-commander/games/venue/${venueId}`),
        fetch(`/api/club-commander/waitlist/venue/${venueId}`),
        fetch('/api/club-commander/waitlist/my')
      ]);

      const [venueData, gamesData, waitlistData, myData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json(),
        myRes.json()
      ]);

      if (venueData.success) setVenue(venueData.data.venue);
      if (gamesData.success) setGames(gamesData.data.games || []);
      if (waitlistData.success) setWaitlists(waitlistData.data.waitlists || []);
      if (myData.success) setMyEntries(myData.data.entries || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinWaitlist(gameType, stakes) {
    setJoining(`${gameType}-${stakes}`);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/club-commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: parseInt(venueId),
          game_type: gameType,
          stakes: stakes,
          source: 'app'
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Added to ${stakes} ${gameType.toUpperCase()} waitlist`);
        fetchData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to join waitlist');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setJoining(null);
    }
  }

  async function handleLeaveWaitlist(entryId) {
    try {
      const res = await fetch(`/api/club-commander/waitlist/${entryId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to leave waitlist:', err);
    }
  }

  // Group games by type and stakes
  const gameOptions = games
    .filter(g => ['waiting', 'running'].includes(g.status))
    .reduce((acc, game) => {
      const key = `${game.game_type}-${game.stakes}`;
      if (!acc[key]) {
        acc[key] = {
          gameType: game.game_type,
          stakes: game.stakes,
          tables: [],
          waitlistCount: 0
        };
      }
      acc[key].tables.push(game);
      return acc;
    }, {});

  // Add waitlist counts
  waitlists.forEach(entry => {
    const key = `${entry.game_type}-${entry.stakes}`;
    if (gameOptions[key]) {
      gameOptions[key].waitlistCount++;
    }
  });

  // Check if user is already on a waitlist
  function isOnWaitlist(gameType, stakes) {
    return myEntries.some(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      e.status === 'waiting'
    );
  }

  function getMyPosition(gameType, stakes) {
    const entry = myEntries.find(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      e.status === 'waiting'
    );
    return entry?.position || null;
  }

  function getMyEntryId(gameType, stakes) {
    const entry = myEntries.find(e =>
      e.venue_id === parseInt(venueId) &&
      e.game_type === gameType &&
      e.stakes === stakes &&
      e.status === 'waiting'
    );
    return entry?.id || null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-[#9CA3AF] mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-[#1F2937]">Venue Not Found</h1>
          <p className="text-[#6B7280] mt-2">This venue doesn't exist or isn't using Club Commander.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Waitlist | {venue.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-[#1F2937]">{venue.name}</h1>
            <p className="text-sm text-[#6B7280]">{venue.city}, {venue.state}</p>
          </div>
        </header>

        {/* Alerts */}
        <div className="max-w-lg mx-auto px-4 pt-4">
          {success && (
            <div className="mb-4 p-4 bg-[#D1FAE5] rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-[#059669]" />
              <p className="text-sm text-[#059669] font-medium">{success}</p>
            </div>
          )}
          {error && (
            <div className="mb-4 p-4 bg-[#FEF2F2] rounded-xl">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="max-w-lg mx-auto px-4 py-4 space-y-4">
          {/* Live Games */}
          <section>
            <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
              Live Games
            </h2>

            {Object.keys(gameOptions).length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 text-center">
                <Users className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                <p className="text-[#6B7280]">No games running</p>
                <p className="text-sm text-[#9CA3AF] mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-3">
                {Object.values(gameOptions).map((option) => {
                  const onWaitlist = isOnWaitlist(option.gameType, option.stakes);
                  const position = getMyPosition(option.gameType, option.stakes);
                  const entryId = getMyEntryId(option.gameType, option.stakes);
                  const isJoining = joining === `${option.gameType}-${option.stakes}`;
                  const gameLabel = GAME_TYPES.find(g => g.value === option.gameType)?.short || option.gameType.toUpperCase();

                  return (
                    <div
                      key={`${option.gameType}-${option.stakes}`}
                      className="bg-white rounded-xl border border-[#E5E7EB] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-[#1F2937]">
                            {option.stakes} {gameLabel}
                          </h3>
                          <div className="flex items-center gap-4 mt-1 text-sm text-[#6B7280]">
                            <span>{option.tables.length} table{option.tables.length !== 1 ? 's' : ''}</span>
                            <span>{option.waitlistCount} waiting</span>
                          </div>
                        </div>

                        {onWaitlist ? (
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-[#1877F2]">
                              <Clock className="w-4 h-4" />
                              <span className="font-semibold">#{position}</span>
                            </div>
                            <button
                              onClick={() => handleLeaveWaitlist(entryId)}
                              className="text-xs text-[#EF4444] hover:underline mt-1"
                            >
                              Leave
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleJoinWaitlist(option.gameType, option.stakes)}
                            disabled={isJoining}
                            className="px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            {isJoining ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                Join
                                <ChevronRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Waitlist Entries */}
          {myEntries.filter(e => e.venue_id === parseInt(venueId) && e.status === 'waiting').length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
                Your Waitlist
              </h2>
              <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                {myEntries
                  .filter(e => e.venue_id === parseInt(venueId) && e.status === 'waiting')
                  .map((entry) => {
                    const gameLabel = GAME_TYPES.find(g => g.value === entry.game_type)?.short || entry.game_type.toUpperCase();
                    return (
                      <div key={entry.id} className="p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-[#1F2937]">
                            {entry.stakes} {gameLabel}
                          </h3>
                          <p className="text-sm text-[#6B7280]">
                            Position #{entry.position}
                          </p>
                        </div>
                        <button
                          onClick={() => handleLeaveWaitlist(entry.id)}
                          className="text-sm text-[#EF4444] hover:underline"
                        >
                          Leave
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Info */}
          <section className="pt-4">
            <div className="bg-[#EFF6FF] rounded-xl p-4">
              <h3 className="font-medium text-[#1E40AF] mb-2">How it works</h3>
              <ul className="text-sm text-[#3B82F6] space-y-1">
                <li>1. Join the waitlist for your preferred game</li>
                <li>2. You'll get a text when your seat is ready</li>
                <li>3. Check in at the desk within 5 minutes</li>
              </ul>
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
