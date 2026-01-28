/**
 * Player Waitlist Join Page - Public page for players to join waitlist
 * URL: /hub/captain/waitlist/[venueId]
 * UI: Facebook color scheme with futuristic metallic styling
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Clock, Users, CheckCircle, MapPin, ChevronRight, Loader2, Zap } from 'lucide-react';

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
        fetch(`/api/captain/venues/${venueId}`),
        fetch(`/api/captain/games/venue/${venueId}`),
        fetch(`/api/captain/waitlist/venue/${venueId}`),
        fetch('/api/captain/waitlist/my')
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
      const res = await fetch('/api/captain/waitlist', {
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
      const res = await fetch(`/api/captain/waitlist/${entryId}`, {
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
        <div className="captain-icon-box-glow">
          <Loader2 className="w-6 h-6 animate-spin text-[#1877F2]" />
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="captain-card p-8 text-center">
          <div className="captain-icon-box mx-auto mb-4">
            <MapPin className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-[#1F2937]">Venue Not Found</h1>
          <p className="text-[#6B7280] mt-2">This venue doesn't exist or isn't using Captain.</p>
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
        {/* Futuristic Header */}
        <header className="captain-header sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="captain-icon-box-glow">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#1F2937] tracking-wide">{venue.name}</h1>
                <p className="text-sm text-[#6B7280] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {venue.city}, {venue.state}
                </p>
              </div>
            </div>
          </div>
        </header>

        {/* Alerts */}
        <div className="max-w-lg mx-auto px-4 pt-4">
          {success && (
            <div className="mb-4 p-4 rounded-xl flex items-center gap-3 border-2 border-[#10B981] bg-gradient-to-r from-[#D1FAE5] to-[#ECFDF5]"
              style={{ boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}>
              <CheckCircle className="w-5 h-5 text-[#059669]" />
              <p className="text-sm text-[#059669] font-semibold">{success}</p>
            </div>
          )}
          {error && (
            <div className="mb-4 p-4 rounded-xl border-2 border-[#EF4444] bg-gradient-to-r from-[#FEF2F2] to-[#FEE2E2]"
              style={{ boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)' }}>
              <p className="text-sm text-[#EF4444] font-semibold">{error}</p>
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
          {/* Live Games */}
          <section>
            <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="captain-status-live">Live Games</span>
            </h2>

            {Object.keys(gameOptions).length === 0 ? (
              <div className="captain-card p-8 text-center">
                <div className="captain-icon-box mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-[#6B7280] font-medium">No games running</p>
                <p className="text-sm text-[#9CA3AF] mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.values(gameOptions).map((option) => {
                  const onWaitlist = isOnWaitlist(option.gameType, option.stakes);
                  const position = getMyPosition(option.gameType, option.stakes);
                  const entryId = getMyEntryId(option.gameType, option.stakes);
                  const isJoining = joining === `${option.gameType}-${option.stakes}`;
                  const gameLabel = GAME_TYPES.find(g => g.value === option.gameType)?.short || option.gameType.toUpperCase();

                  return (
                    <div
                      key={`${option.gameType}-${option.stakes}`}
                      className={`captain-card p-5 ${onWaitlist ? 'captain-card-glow' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-[#1F2937] text-lg tracking-wide">
                            {option.stakes} <span className="text-[#1877F2]">{gameLabel}</span>
                          </h3>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="captain-badge-primary">
                              {option.tables.length} table{option.tables.length !== 1 ? 's' : ''}
                            </span>
                            <span className="captain-badge-warning">
                              {option.waitlistCount} waiting
                            </span>
                          </div>
                        </div>

                        {onWaitlist ? (
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-[#1877F2]">
                              <Clock className="w-5 h-5" />
                              <span className="text-2xl font-bold">#{position}</span>
                            </div>
                            <button
                              onClick={() => handleLeaveWaitlist(entryId)}
                              className="text-xs text-[#EF4444] hover:underline mt-2 font-semibold uppercase tracking-wide"
                            >
                              Leave List
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleJoinWaitlist(option.gameType, option.stakes)}
                            disabled={isJoining}
                            className="captain-btn captain-btn-primary"
                          >
                            {isJoining ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <>
                                Join
                                <ChevronRight className="w-5 h-5" />
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
              <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3">
                Your Waitlist
              </h2>
              <div className="captain-card overflow-hidden">
                {myEntries
                  .filter(e => e.venue_id === parseInt(venueId) && e.status === 'waiting')
                  .map((entry, idx, arr) => {
                    const gameLabel = GAME_TYPES.find(g => g.value === entry.game_type)?.short || entry.game_type.toUpperCase();
                    return (
                      <div
                        key={entry.id}
                        className={`p-4 flex items-center justify-between ${idx !== arr.length - 1 ? 'border-b border-[#E5E7EB]' : ''}`}
                      >
                        <div>
                          <h3 className="font-semibold text-[#1F2937]">
                            {entry.stakes} <span className="text-[#1877F2]">{gameLabel}</span>
                          </h3>
                          <p className="text-sm text-[#6B7280] mt-1">
                            Position <span className="font-bold text-[#1877F2]">#{entry.position}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => handleLeaveWaitlist(entry.id)}
                          className="captain-btn captain-btn-danger text-xs py-2 px-4"
                        >
                          Leave
                        </button>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Info Card */}
          <section className="pt-2">
            <div className="captain-card p-5 bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]">
              <h3 className="font-bold text-[#1E40AF] mb-3 uppercase tracking-wide text-sm">How it works</h3>
              <div className="space-y-3">
                {[
                  'Join the waitlist for your preferred game',
                  'You\'ll get a text when your seat is ready',
                  'Check in at the desk within 5 minutes'
                ].map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#1877F2] text-white flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ boxShadow: '0 0 10px rgba(24, 119, 242, 0.5)' }}>
                      {idx + 1}
                    </div>
                    <p className="text-sm text-[#3B82F6] font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="captain-divider" />

          {/* Powered By */}
          <div className="text-center pb-6">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-widest">Powered by</p>
            <p className="text-sm font-bold text-[#1877F2] tracking-wide">Smarter Captain</p>
          </div>
        </main>
      </div>
    </>
  );
}
