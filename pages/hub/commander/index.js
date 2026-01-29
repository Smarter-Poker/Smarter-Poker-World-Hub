/**
 * Player Commander Hub - Browse venues and manage waitlists
 * UI: Dark industrial sci-fi gaming UI with metallic chrome frames
 */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { MapPin, Search, RefreshCw, AlertCircle, Trophy, FileText, Shield, Zap, Radio, DollarSign, Users, Clock } from 'lucide-react';
import VenueCard from '../../../src/components/commander/player/VenueCard';
import WaitlistCard from '../../../src/components/commander/player/WaitlistCard';
import PushNotificationProvider from '../../../src/components/commander/shared/PushNotificationProvider';

export default function CommanderHub() {
  const [venues, setVenues] = useState([]);
  const [myWaitlists, setMyWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [liveGames, setLiveGames] = useState([]);

  async function fetchVenues() {
    try {
      let url = '/api/commander/venues?commander_enabled=true&limit=20';
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lng=${userLocation.lng}&radius=100`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setVenues(data.data.venues || []);
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
      setError('Failed to load venues');
    } finally {
      setLoading(false);
    }
  }

  async function fetchMyWaitlists() {
    try {
      const res = await fetch('/api/commander/waitlist/my');
      const data = await res.json();
      if (data.success) {
        setMyWaitlists(data.data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch waitlists:', err);
    }
  }

  async function fetchLiveGames() {
    try {
      const res = await fetch('/api/commander/games/live?limit=10');
      const data = await res.json();
      if (data.success) {
        setLiveGames(data.data?.games || []);
      }
    } catch (err) {
      console.error('Failed to fetch live games:', err);
    }
  }

  function getUserLocation() {
    if (!navigator.geolocation) return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationLoading(false);
      },
      () => setLocationLoading(false)
    );
  }

  useEffect(() => {
    fetchVenues();
    fetchMyWaitlists();
    fetchLiveGames();
  }, [userLocation]);

  async function handleLeaveWaitlist(entryId) {
    if (!window.confirm('Leave this waitlist?')) return;
    try {
      const res = await fetch(`/api/commander/waitlist/${entryId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) fetchMyWaitlists();
    } catch (err) {
      console.error('Failed to leave waitlist:', err);
    }
  }

  const filteredVenues = venues.filter(venue =>
    venue.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    venue.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PushNotificationProvider>
      <Head>
        <title>Live Poker | Club Commander</title>
        <meta name="description" content="Find live poker games near you and join waitlists" />
      </Head>

      <div className="cmd-page">
        {/* Header with chrome rail and glow strip */}
        <header className="cmd-header-full sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-5">
            <div className="flex items-center gap-4">
              <div className="cmd-icon-box cmd-icon-box-glow w-14 h-14">
                <Zap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-wider cmd-text-glow">LIVE POKER</h1>
                <p className="text-sm text-[#64748B] font-medium tracking-wide">Find games and join waitlists</p>
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

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          {/* Quick Links - Metallic framed panels */}
          <section className="grid grid-cols-3 gap-4">
            {[
              { href: '/hub/commander/leagues', icon: Trophy, label: 'Leagues', sub: 'Compete' },
              { href: '/hub/commander/hand-history', icon: FileText, label: 'Hands', sub: 'Review' },
              { href: '/hub/commander/responsible-gaming', icon: Shield, label: 'Limits', sub: 'Settings' },
            ].map(({ href, icon: Icon, label, sub }) => (
              <Link
                key={href}
                href={href}
                className="cmd-panel cmd-corner-lights p-5 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all group text-center block"
              >
                {/* Corner glow lights */}
                <span className="cmd-light cmd-light-tl" />
                <span className="cmd-light cmd-light-br" />

                {/* Rivets */}
                <div className="absolute top-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute top-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 left-3"><span className="cmd-rivet cmd-rivet-sm" /></div>
                <div className="absolute bottom-3 right-3"><span className="cmd-rivet cmd-rivet-sm" /></div>

                <div className="cmd-icon-box w-14 h-14 mx-auto mb-4 group-hover:cmd-icon-box-glow transition-all">
                  <Icon className="w-7 h-7" />
                </div>
                <p className="font-bold text-white text-lg group-hover:text-[#22D3EE] transition-colors">{label}</p>
                <p className="text-xs text-[#64748B] font-semibold uppercase tracking-widest mt-1">{sub}</p>
              </Link>
            ))}
          </section>

          {/* My Waitlists */}
          {myWaitlists.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="cmd-badge cmd-badge-live">
                  <span className="cmd-live-dot" style={{ width: 8, height: 8 }} />
                  MY WAITLISTS
                </div>
              </div>
              <div className="space-y-4">
                {myWaitlists.map((entry) => (
                  <WaitlistCard
                    key={entry.waitlist_entry.id}
                    entry={entry}
                    onLeave={() => handleLeaveWaitlist(entry.waitlist_entry.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Live Games */}
          {liveGames.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="cmd-badge cmd-badge-live">
                  <span className="cmd-live-dot" style={{ width: 8, height: 8 }} />
                  LIVE GAMES NOW
                </div>
              </div>
              <div className="space-y-3">
                {liveGames.slice(0, 5).map((game) => (
                  <div key={game.id} className="cmd-panel p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {game.stakes} {game.game_type?.toUpperCase() || 'NLHE'}
                        </p>
                        <p className="text-sm text-[#64748B]">
                          {game.poker_venues?.name || 'Unknown Venue'}
                          {game.poker_venues?.city && ` - ${game.poker_venues.city}, ${game.poker_venues.state}`}
                        </p>
                        <div className="flex items-center gap-3 text-sm text-[#64748B] mt-1">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {game.player_count || 0}/{game.max_players || 9}
                          </span>
                          {game.waitlist_count > 0 && (
                            <span className="text-[#F59E0B] flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {game.waitlist_count} waiting
                            </span>
                          )}
                          <span className={`text-xs font-medium ${game.status === 'running' ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
                            {game.status === 'running' ? 'Running' : 'Starting'}
                          </span>
                        </div>
                      </div>
                      {game.poker_venues?.id && (
                        <a
                          href={`/hub/commander/venues/${game.poker_venues.id}`}
                          className="cmd-btn cmd-btn-secondary px-3 py-2 text-sm"
                        >
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Search */}
          <section>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search venues..."
                  className="cmd-input pl-14"
                />
              </div>
              <button
                onClick={getUserLocation}
                disabled={locationLoading}
                className="cmd-btn cmd-btn-secondary"
                title="Use my location"
              >
                {locationLoading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <MapPin className="w-5 h-5" />
                )}
              </button>
            </div>
            {userLocation && (
              <div className="mt-4">
                <span className="cmd-badge cmd-badge-live">
                  <MapPin className="w-4 h-4" />
                  NEAR YOU
                </span>
              </div>
            )}
          </section>

          {/* Glow strip separator */}
          <div className="cmd-glow-strip" />

          {/* Venues */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="cmd-header-bar">
                <Radio className="w-5 h-5 text-[#22D3EE]" />
                <span className="cmd-header-bar-text">VENUES WITH LIVE GAMES</span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="cmd-panel p-6 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-[#1A2E4A]" />
                      <div className="flex-1">
                        <div className="h-6 bg-[#1A2E4A] rounded w-1/3 mb-3" />
                        <div className="h-4 bg-[#1A2E4A] rounded w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="cmd-panel cmd-corner-lights p-10 text-center">
                <span className="cmd-light cmd-light-tl" />
                <span className="cmd-light cmd-light-tr" />
                <span className="cmd-light cmd-light-bl" />
                <span className="cmd-light cmd-light-br" />
                <div className="cmd-icon-box mx-auto mb-5" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                  <AlertCircle className="w-7 h-7" />
                </div>
                <p className="text-[#CBD5E1] font-semibold text-lg">{error}</p>
                <button onClick={fetchVenues} className="cmd-btn cmd-btn-primary mt-6">
                  RETRY CONNECTION
                </button>
              </div>
            ) : filteredVenues.length === 0 ? (
              <div className="cmd-panel cmd-corner-lights p-10 text-center">
                <span className="cmd-light cmd-light-tl" />
                <span className="cmd-light cmd-light-tr" />
                <span className="cmd-light cmd-light-bl" />
                <span className="cmd-light cmd-light-br" />
                <div className="cmd-icon-box mx-auto mb-5">
                  <MapPin className="w-7 h-7" />
                </div>
                <p className="text-[#CBD5E1] font-semibold text-lg">
                  {searchQuery ? 'No venues match your search' : 'No venues with live games found'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredVenues.map((venue) => (
                  <VenueCard key={venue.id} venue={venue} games={[]} waitlistCounts={{}} />
                ))}
              </div>
            )}
          </section>

          {/* Divider */}
          <div className="cmd-divider" />

          {/* Footer */}
          <div className="text-center pb-8">
            <p className="text-xs text-[#64748B] uppercase tracking-[0.3em] mb-2">Powered by</p>
            <p className="text-xl font-extrabold cmd-text-chrome tracking-wider">CLUB COMMANDER</p>
          </div>
        </main>
      </div>
    </PushNotificationProvider>
  );
}
