/**
 * Venue Detail Page - View games and join waitlist
 * Reference: SCOPE_LOCK.md - Phase 1 UI Pages
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Globe,
  Users,
  Clock,
  Plus,
  RefreshCw
} from 'lucide-react';

export default function VenueDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [waitlists, setWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [message, setMessage] = useState(null);

  // Fetch venue data
  async function fetchData() {
    if (!id) return;

    try {
      const [venueRes, gamesRes, waitlistRes] = await Promise.all([
        fetch(`/api/commander/venues/${id}`),
        fetch(`/api/commander/games/venue/${id}`),
        fetch(`/api/commander/waitlist/venue/${id}`)
      ]);

      const [venueData, gamesData, waitlistData] = await Promise.all([
        venueRes.json(),
        gamesRes.json(),
        waitlistRes.json()
      ]);

      if (venueData.success) {
        setVenue(venueData.data.venue);
      }

      if (gamesData.success) {
        setGames(gamesData.data.games || []);
      }

      if (waitlistData.success) {
        setWaitlists(waitlistData.data.waitlists || []);
      }
    } catch (error) {
      console.error('Failed to fetch venue data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();

    // Auto-refresh every minute
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [id]);

  // Handle join waitlist
  async function handleJoinWaitlist(gameType, stakes) {
    setJoining(`${gameType}-${stakes}`);

    try {
      const res = await fetch('/api/commander/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: id,
          game_type: gameType,
          stakes: stakes
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `Joined waitlist! Position: ${data.data.position}, Est. wait: ${data.data.estimated_wait} minutes`
        });
        fetchData();
      } else {
        setMessage({ type: 'error', text: data.error?.message || 'Failed to join waitlist' });
      }
    } catch (error) {
      console.error('Failed to join waitlist:', error);
      setMessage({ type: 'error', text: 'Failed to join waitlist' });
    } finally {
      setTimeout(() => setMessage(null), 4000);
      setJoining(null);
    }
  }

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#22D3EE] animate-spin" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <div className="cmd-panel p-6 text-center">
          <div className="cmd-rivets">
            <div className="cmd-rivet cmd-rivet-tl" />
            <div className="cmd-rivet cmd-rivet-tr" />
            <div className="cmd-rivet cmd-rivet-bl" />
            <div className="cmd-rivet cmd-rivet-br" />
          </div>
          <p className="text-[#64748B] mb-4">Venue not found</p>
          <Link
            href="/hub/commander"
            className="text-[#22D3EE] font-medium hover:underline"
          >
            Back to venues
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{venue.name} | Live Poker</title>
      </Head>

      <div className="cmd-page">
        {/* Notification Banner */}
        {message && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium ${
              message.type === 'success'
                ? 'bg-[#0F172A] border-b border-[#10B981]/40 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-[#0F172A] border-b border-[#EF4444]/40 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <Link
              href="/hub/commander"
              className="inline-flex items-center gap-2 text-[#64748B] hover:text-[#22D3EE] mb-3"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>

            <h1 className="text-xl font-bold text-white">{venue.name}</h1>

            <div className="flex flex-wrap gap-4 mt-2 text-sm text-[#64748B]">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {venue.city}, {venue.state}
              </span>
              {venue.phone && (
                <a
                  href={`tel:${venue.phone}`}
                  className="flex items-center gap-1 text-[#22D3EE]"
                >
                  <Phone className="w-4 h-4" />
                  {venue.phone}
                </a>
              )}
              {venue.website && (
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[#22D3EE]"
                >
                  <Globe className="w-4 h-4" />
                  Website
                </a>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Live Games */}
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Live Games</h2>

            {games.length === 0 ? (
              <div className="cmd-panel p-6 text-center relative">
                <div className="cmd-rivets">
                  <div className="cmd-rivet cmd-rivet-tl" />
                  <div className="cmd-rivet cmd-rivet-tr" />
                  <div className="cmd-rivet cmd-rivet-bl" />
                  <div className="cmd-rivet cmd-rivet-br" />
                </div>
                <Users className="w-8 h-8 mx-auto mb-2 text-[#64748B] opacity-50" />
                <p className="text-[#64748B]">No live games right now</p>
              </div>
            ) : (
              <div className="space-y-3">
                {games.map((game) => {
                  const occupiedSeats = game.commander_seats?.filter(s => s.status === 'occupied').length || game.current_players || 0;
                  const waitlist = waitlists.find(w =>
                    w.game_type === game.game_type && w.stakes === game.stakes
                  );

                  return (
                    <div
                      key={game.id}
                      className="cmd-panel p-4 relative"
                    >
                      <div className="cmd-rivets">
                        <div className="cmd-rivet cmd-rivet-tl" />
                        <div className="cmd-rivet cmd-rivet-tr" />
                        <div className="cmd-rivet cmd-rivet-bl" />
                        <div className="cmd-rivet cmd-rivet-br" />
                      </div>
                      <div className="cmd-corner-lights">
                        <span className="cmd-light" />
                        <span className="cmd-light" />
                        <span className="cmd-light" />
                        <span className="cmd-light" />
                      </div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {game.game_type?.toUpperCase()} {game.stakes}
                            </span>
                            <span className={`cmd-badge ${
                              game.status === 'running'
                                ? 'cmd-badge-live'
                                : 'cmd-badge-warning'
                            }`}>
                              {game.status === 'running' ? 'Running' : 'Waiting'}
                            </span>
                          </div>
                          {game.commander_tables && (
                            <p className="text-sm text-[#64748B] mt-1">
                              Table {game.commander_tables.table_number}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1 text-sm text-white">
                          <Users className="w-4 h-4" />
                          <span>{occupiedSeats}/{game.max_players || 9} seated</span>
                        </div>
                        {waitlist && (
                          <div className="flex items-center gap-1 text-sm text-[#F59E0B]">
                            <Clock className="w-4 h-4" />
                            <span>{waitlist.count} waiting</span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => handleJoinWaitlist(game.game_type, game.stakes)}
                        disabled={joining === `${game.game_type}-${game.stakes}`}
                        className="cmd-btn cmd-btn-primary mt-4 w-full py-3 flex items-center justify-center gap-2"
                      >
                        {joining === `${game.game_type}-${game.stakes}` ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Joining...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            Join Waitlist
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Waitlists Summary */}
          {waitlists.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">Waitlists</h2>
              <div className="grid grid-cols-2 gap-3">
                {waitlists.map((wl) => (
                  <div
                    key={`${wl.game_type}-${wl.stakes}`}
                    className="cmd-panel p-4 relative"
                  >
                    <div className="cmd-rivets">
                      <div className="cmd-rivet cmd-rivet-tl" />
                      <div className="cmd-rivet cmd-rivet-tr" />
                      <div className="cmd-rivet cmd-rivet-bl" />
                      <div className="cmd-rivet cmd-rivet-br" />
                    </div>
                    <p className="font-medium text-white">
                      {wl.game_type?.toUpperCase()} {wl.stakes}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-sm text-[#64748B]">
                      <span className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        {wl.count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        ~{wl.estimated_wait}m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
