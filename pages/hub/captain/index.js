/**
 * Player Captain Hub - Browse venues and manage waitlists
 * UI: Dark industrial sci-fi gaming UI with metallic chrome frames
 */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { MapPin, Search, RefreshCw, AlertCircle, Trophy, FileText, Shield, Zap, Radio } from 'lucide-react';
import VenueCard from '../../../src/components/captain/player/VenueCard';
import WaitlistCard from '../../../src/components/captain/player/WaitlistCard';

export default function CaptainHub() {
  const [venues, setVenues] = useState([]);
  const [myWaitlists, setMyWaitlists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  async function fetchVenues() {
    try {
      let url = '/api/captain/venues?captain_enabled=true&limit=20';
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
      const res = await fetch('/api/captain/waitlist/my');
      const data = await res.json();
      if (data.success) {
        setMyWaitlists(data.data.entries || []);
      }
    } catch (err) {
      console.error('Failed to fetch waitlists:', err);
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
  }, [userLocation]);

  async function handleLeaveWaitlist(entryId) {
    if (!window.confirm('Leave this waitlist?')) return;
    try {
      const res = await fetch(`/api/captain/waitlist/${entryId}`, { method: 'DELETE' });
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
    <>
      <Head>
        <title>Live Poker | Smarter Captain</title>
        <meta name="description" content="Find live poker games near you and join waitlists" />
      </Head>

      <div className="cap-page">
        {/* Header with chrome rail and glow strip */}
        <header className="cap-header-full sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-5">
            <div className="flex items-center gap-4">
              <div className="cap-icon-box cap-icon-box-glow w-14 h-14">
                <Zap className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-wider cap-text-glow">LIVE POKER</h1>
                <p className="text-sm text-[#64748B] font-medium tracking-wide">Find games and join waitlists</p>
              </div>
              {/* Rivets */}
              <div className="ml-auto flex gap-2">
                <span className="cap-rivet" />
                <span className="cap-rivet" />
                <span className="cap-rivet" />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          {/* Quick Links - Metallic framed panels */}
          <section className="grid grid-cols-3 gap-4">
            {[
              { href: '/hub/captain/leagues', icon: Trophy, label: 'Leagues', sub: 'Compete' },
              { href: '/hub/captain/hand-history', icon: FileText, label: 'Hands', sub: 'Review' },
              { href: '/hub/captain/responsible-gaming', icon: Shield, label: 'Limits', sub: 'Settings' },
            ].map(({ href, icon: Icon, label, sub }) => (
              <Link
                key={href}
                href={href}
                className="cap-panel cap-corner-lights p-5 hover:shadow-[0_0_30px_rgba(34,211,238,0.3)] transition-all group text-center block"
              >
                {/* Corner glow lights */}
                <span className="cap-light cap-light-tl" />
                <span className="cap-light cap-light-br" />

                {/* Rivets */}
                <div className="absolute top-3 left-3"><span className="cap-rivet cap-rivet-sm" /></div>
                <div className="absolute top-3 right-3"><span className="cap-rivet cap-rivet-sm" /></div>
                <div className="absolute bottom-3 left-3"><span className="cap-rivet cap-rivet-sm" /></div>
                <div className="absolute bottom-3 right-3"><span className="cap-rivet cap-rivet-sm" /></div>

                <div className="cap-icon-box w-14 h-14 mx-auto mb-4 group-hover:cap-icon-box-glow transition-all">
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
                <div className="cap-badge cap-badge-live">
                  <span className="cap-live-dot" style={{ width: 8, height: 8 }} />
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
                  className="cap-input pl-14"
                />
              </div>
              <button
                onClick={getUserLocation}
                disabled={locationLoading}
                className="cap-btn cap-btn-secondary"
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
                <span className="cap-badge cap-badge-live">
                  <MapPin className="w-4 h-4" />
                  NEAR YOU
                </span>
              </div>
            )}
          </section>

          {/* Glow strip separator */}
          <div className="cap-glow-strip" />

          {/* Venues */}
          <section>
            <div className="flex items-center gap-3 mb-5">
              <div className="cap-header-bar">
                <Radio className="w-5 h-5 text-[#22D3EE]" />
                <span className="cap-header-bar-text">VENUES WITH LIVE GAMES</span>
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="cap-panel p-6 animate-pulse">
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
              <div className="cap-panel cap-corner-lights p-10 text-center">
                <span className="cap-light cap-light-tl" />
                <span className="cap-light cap-light-tr" />
                <span className="cap-light cap-light-bl" />
                <span className="cap-light cap-light-br" />
                <div className="cap-icon-box mx-auto mb-5" style={{ borderColor: '#EF4444', color: '#EF4444' }}>
                  <AlertCircle className="w-7 h-7" />
                </div>
                <p className="text-[#CBD5E1] font-semibold text-lg">{error}</p>
                <button onClick={fetchVenues} className="cap-btn cap-btn-primary mt-6">
                  RETRY CONNECTION
                </button>
              </div>
            ) : filteredVenues.length === 0 ? (
              <div className="cap-panel cap-corner-lights p-10 text-center">
                <span className="cap-light cap-light-tl" />
                <span className="cap-light cap-light-tr" />
                <span className="cap-light cap-light-bl" />
                <span className="cap-light cap-light-br" />
                <div className="cap-icon-box mx-auto mb-5">
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
          <div className="cap-divider" />

          {/* Footer */}
          <div className="text-center pb-8">
            <p className="text-xs text-[#64748B] uppercase tracking-[0.3em] mb-2">Powered by</p>
            <p className="text-xl font-extrabold cap-text-chrome tracking-wider">SMARTER CAPTAIN</p>
          </div>
        </main>
      </div>
    </>
  );
}
