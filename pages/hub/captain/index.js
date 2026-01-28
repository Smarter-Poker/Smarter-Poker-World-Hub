/**
 * Player Captain Hub - Browse venues and manage waitlists
 * Reference: SCOPE_LOCK.md - Phase 1 UI Pages
 * UI: Facebook color scheme with DRAMATIC futuristic sci-fi styling
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

  // Fetch venues
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

  // Fetch user's waitlists
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

  // Get user location
  function getUserLocation() {
    if (!navigator.geolocation) return;

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationLoading(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setLocationLoading(false);
      }
    );
  }

  // Initial load
  useEffect(() => {
    fetchVenues();
    fetchMyWaitlists();
  }, [userLocation]);

  // Handle leaving waitlist
  async function handleLeaveWaitlist(entryId) {
    if (!window.confirm('Leave this waitlist?')) return;

    try {
      const res = await fetch(`/api/captain/waitlist/${entryId}`, {
        method: 'DELETE'
      });

      const data = await res.json();
      if (data.success) {
        fetchMyWaitlists();
      }
    } catch (err) {
      console.error('Failed to leave waitlist:', err);
    }
  }

  // Filter venues by search
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

      <div className="min-h-screen bg-[#F0F2F5]">
        {/* Futuristic Header with animated gradient border */}
        <header className="captain-header sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-5">
            <div className="flex items-center gap-4">
              <div className="captain-icon-box captain-icon-box-glow">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold captain-gradient-text tracking-wider">LIVE POKER</h1>
                <p className="text-sm text-[#6B7280] font-medium tracking-wide">Find games and join waitlists</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 space-y-8">
          {/* Quick Links - Dramatic cards */}
          <section className="grid grid-cols-3 gap-4">
            <Link
              href="/hub/captain/leagues"
              className="captain-card captain-card-corners p-5 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-14 h-14 mx-auto mb-4 group-hover:captain-icon-box-glow transition-all">
                <Trophy className="w-7 h-7" />
              </div>
              <p className="font-bold text-[#1F2937] text-lg group-hover:captain-gradient-text transition-colors">Leagues</p>
              <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-widest mt-1">Compete</p>
            </Link>
            <Link
              href="/hub/captain/hand-history"
              className="captain-card captain-card-corners p-5 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-14 h-14 mx-auto mb-4 group-hover:captain-icon-box-glow transition-all">
                <FileText className="w-7 h-7" />
              </div>
              <p className="font-bold text-[#1F2937] text-lg group-hover:captain-gradient-text transition-colors">Hands</p>
              <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-widest mt-1">Review</p>
            </Link>
            <Link
              href="/hub/captain/responsible-gaming"
              className="captain-card captain-card-corners p-5 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-14 h-14 mx-auto mb-4 group-hover:captain-icon-box-glow transition-all">
                <Shield className="w-7 h-7" />
              </div>
              <p className="font-bold text-[#1F2937] text-lg group-hover:captain-gradient-text transition-colors">Limits</p>
              <p className="text-xs text-[#6B7280] font-semibold uppercase tracking-widest mt-1">Settings</p>
            </Link>
          </section>

          {/* My Waitlists */}
          {myWaitlists.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-4">
                <div className="captain-badge captain-badge-live">
                  <Radio className="w-4 h-4" />
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

          {/* Search and Location */}
          <section>
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search venues..."
                  className="captain-input pl-14"
                />
              </div>
              <button
                onClick={getUserLocation}
                disabled={locationLoading}
                className="captain-btn captain-btn-secondary"
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
                <span className="captain-badge captain-badge-success">
                  <MapPin className="w-4 h-4" />
                  Showing venues near you
                </span>
              </div>
            )}
          </section>

          {/* Venues */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <div className="captain-badge captain-badge-live">
                <Radio className="w-4 h-4" />
                VENUES WITH LIVE GAMES
              </div>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="captain-card p-6 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 bg-[#E2E8F0] rounded-xl" />
                      <div className="flex-1">
                        <div className="h-6 bg-[#E2E8F0] rounded w-1/3 mb-3" />
                        <div className="h-4 bg-[#E2E8F0] rounded w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="captain-card captain-card-corners p-10 text-center">
                <div className="captain-icon-box mx-auto mb-5" style={{ borderColor: '#EF4444' }}>
                  <AlertCircle className="w-7 h-7 text-[#EF4444]" />
                </div>
                <p className="text-[#6B7280] font-semibold text-lg">{error}</p>
                <button
                  onClick={fetchVenues}
                  className="captain-btn captain-btn-primary mt-6"
                >
                  RETRY CONNECTION
                </button>
              </div>
            ) : filteredVenues.length === 0 ? (
              <div className="captain-card captain-card-corners p-10 text-center">
                <div className="captain-icon-box mx-auto mb-5">
                  <MapPin className="w-7 h-7" />
                </div>
                <p className="text-[#6B7280] font-semibold text-lg">
                  {searchQuery
                    ? 'No venues match your search'
                    : 'No venues with live games found'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredVenues.map((venue) => (
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    games={[]}
                    waitlistCounts={{}}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Divider with diamond accent */}
          <div className="captain-divider" />

          {/* Powered By */}
          <div className="text-center pb-8">
            <p className="text-xs text-[#9CA3AF] uppercase tracking-[0.3em] mb-2">Powered by</p>
            <p className="text-xl font-extrabold captain-gradient-text tracking-wider">SMARTER CAPTAIN</p>
          </div>
        </main>
      </div>
    </>
  );
}
