/**
 * Player Waitlist Join Page - Public page for players to join waitlist
 * URL: /hub/commander/waitlist/[venueId]
 * UI: Dark industrial sci-fi gaming UI with metallic chrome frames
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

  function getAuthToken() {
    let token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      const sbKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      if (sbKeys.length > 0) token = localStorage.getItem(sbKeys[0]);
    }
    return token;
  }

  async function fetchData() {
    try {
      // Public data - no auth needed
      const [venueRes, gamesRes, waitlistRes] = await Promise.all([
        fetch(`/api/commander/venues/${venueId}`),
        fetch(`/api/commander/games/venue/${venueId}`),
        fetch(`/api/commander/waitlist/venue/${venueId}`)
      ]);

      const [venueData, gamesData, waitlistData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json()
      ]);

      if (venueData.success) setVenue(venueData.data.venue);
      if (gamesData.success) setGames(gamesData.data.games || []);
      if (waitlistData.success) setWaitlists(waitlistData.data.waitlists || []);

      // Authenticated data - fetch my entries only if logged in
      const token = getAuthToken();
      if (token) {
        const myRes = await fetch('/api/commander/waitlist/my', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const myData = await myRes.json();
        if (myData.success) setMyEntries(myData.data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinWaitlist(gameType, stakes) {
    const token = getAuthToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/waitlist/${venueId}`);
      return;
    }

    setJoining(`${gameType}-${stakes}`);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
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
    const token = getAuthToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/waitlist/${venueId}`);
      return;
    }

    try {
      const res = await fetch(`/api/commander/waitlist/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
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
      <div className="cmd-page flex items-center justify-center">
        <div className="cmd-icon-box cmd-icon-box-glow">
          <Loader2 className="w-6 h-6 animate-spin text-[#22D3EE]" />
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="cmd-page flex items-center justify-center p-4">
        <div className="cmd-panel cmd-corner-lights p-8 text-center">
          <span className="cmd-light cmd-light-tl" />
          <span className="cmd-light cmd-light-tr" />
          <span className="cmd-light cmd-light-bl" />
          <span className="cmd-light cmd-light-br" />
          <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
          <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
          <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
          <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
          <div className="cmd-icon-box mx-auto mb-4">
            <MapPin className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-semibold text-white">Venue Not Found</h1>
          <p className="text-[#64748B] mt-2">This venue doesn't exist or isn't using Commander.</p>
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

      <div className="cmd-page">
        {/* Header with chrome rail and glow strip */}
        <header className="cmd-header-full sticky top-0 z-10">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="cmd-icon-box cmd-icon-box-glow">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-wide cmd-text-glow">{venue.name}</h1>
                <p className="text-sm text-[#64748B] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {venue.city}, {venue.state}
                </p>
              </div>
              {/* Rivets */}
              <div className="ml-auto flex gap-2">
                <span className="cmd-rivet" />
                <span className="cmd-rivet" />
              </div>
            </div>
          </div>
        </header>

        {/* Alerts */}
        <div className="max-w-lg mx-auto px-4 pt-4">
          {success && (
            <div className="mb-4 p-4 rounded-xl cmd-inset flex items-center gap-3 border-2 border-[#10B981]"
              style={{ boxShadow: '0 0 15px rgba(16, 185, 129, 0.3)' }}>
              <CheckCircle className="w-5 h-5 text-[#10B981]" />
              <p className="text-sm text-[#10B981] font-semibold">{success}</p>
            </div>
          )}
          {error && (
            <div className="mb-4 p-4 rounded-xl cmd-inset border-2 border-[#EF4444]"
              style={{ boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)' }}>
              <p className="text-sm text-[#EF4444] font-semibold">{error}</p>
            </div>
          )}
        </div>

        {/* Main Content */}
        <main className="max-w-lg mx-auto px-4 py-4 space-y-6">
          {/* Live Games */}
          <section>
            <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="cmd-badge cmd-badge-live">Live Games</span>
            </h2>

            {Object.keys(gameOptions).length === 0 ? (
              <div className="cmd-panel cmd-corner-lights p-8 text-center">
                <span className="cmd-light cmd-light-tl" />
                <span className="cmd-light cmd-light-tr" />
                <span className="cmd-light cmd-light-bl" />
                <span className="cmd-light cmd-light-br" />
                <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="cmd-icon-box mx-auto mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <p className="text-[#64748B] font-medium">No games running</p>
                <p className="text-sm text-[#64748B] mt-1">Check back later</p>
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
                      className={`cmd-panel cmd-corner-lights p-5 ${onWaitlist ? 'shadow-[0_0_30px_rgba(34,211,238,0.3)]' : ''}`}
                    >
                      <span className="cmd-light cmd-light-tl" />
                      <span className="cmd-light cmd-light-br" />
                      <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                      <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                      <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                      <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-white text-lg tracking-wide">
                            {option.stakes} <span className="text-[#22D3EE]">{gameLabel}</span>
                          </h3>
                          <div className="flex items-center gap-3 mt-2">
                            <span className="cmd-badge cmd-badge-primary">
                              {option.tables.length} table{option.tables.length !== 1 ? 's' : ''}
                            </span>
                            <span className="cmd-badge cmd-badge-warning">
                              {option.waitlistCount} waiting
                            </span>
                          </div>
                        </div>

                        {onWaitlist ? (
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-[#22D3EE]">
                              <Clock className="w-5 h-5" />
                              <span className="text-2xl font-bold cmd-text-glow">#{position}</span>
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
                            className="cmd-btn cmd-btn-primary"
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
              <h2 className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-3">
                Your Waitlist
              </h2>
              <div className="cmd-panel cmd-corner-lights overflow-hidden">
                <span className="cmd-light cmd-light-tl" />
                <span className="cmd-light cmd-light-br" />
                <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                {myEntries
                  .filter(e => e.venue_id === parseInt(venueId) && e.status === 'waiting')
                  .map((entry, idx, arr) => {
                    const gameLabel = GAME_TYPES.find(g => g.value === entry.game_type)?.short || entry.game_type.toUpperCase();
                    return (
                      <div
                        key={entry.id}
                        className={`p-4 flex items-center justify-between ${idx !== arr.length - 1 ? 'border-b border-[#1A2E4A]' : ''}`}
                      >
                        <div>
                          <h3 className="font-semibold text-white">
                            {entry.stakes} <span className="text-[#22D3EE]">{gameLabel}</span>
                          </h3>
                          <p className="text-sm text-[#64748B] mt-1">
                            Position <span className="font-bold text-[#22D3EE]">#{entry.position}</span>
                          </p>
                        </div>
                        <button
                          onClick={() => handleLeaveWaitlist(entry.id)}
                          className="cmd-btn cmd-btn-danger text-xs py-2 px-4"
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
            <div className="cmd-panel cmd-corner-lights p-5">
              <span className="cmd-light cmd-light-tl" />
              <span className="cmd-light cmd-light-br" />
              <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
              <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
              <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
              <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
              <h3 className="font-bold text-[#22D3EE] mb-3 uppercase tracking-wide text-sm">How it works</h3>
              <div className="space-y-3">
                {[
                  'Join the waitlist for your preferred game',
                  'You\'ll get a text when your seat is ready',
                  'Check in at the desk within 5 minutes'
                ].map((step, idx) => (
                  <div key={idx} className="cmd-inset flex items-start gap-3 p-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{
                        background: 'linear-gradient(180deg, #1E3A5F, #132240)',
                        border: '2px solid #22D3EE',
                        color: '#22D3EE',
                        boxShadow: '0 0 10px rgba(34, 211, 238, 0.4)'
                      }}>
                      {idx + 1}
                    </div>
                    <p className="text-sm text-[#CBD5E1] font-medium">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="cmd-divider" />

          {/* Powered By */}
          <div className="text-center pb-6">
            <p className="text-xs text-[#64748B] uppercase tracking-[0.3em] mb-2">Powered by</p>
            <p className="text-xl font-extrabold cmd-text-chrome tracking-wider">CLUB COMMANDER</p>
          </div>
        </main>
      </div>
    </>
  );
}
