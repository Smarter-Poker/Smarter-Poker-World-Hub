/**
 * Player Captain Hub - Browse venues and manage waitlists
 * Reference: SCOPE_LOCK.md - Phase 1 UI Pages
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { MapPin, Search, RefreshCw, AlertCircle } from 'lucide-react';
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

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-[#1F2937]">Live Poker</h1>
            <p className="text-sm text-[#6B7280]">Find games and join waitlists</p>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* My Waitlists */}
          {myWaitlists.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-[#1F2937] mb-3">My Waitlists</h2>
              <div className="space-y-3">
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
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search venues..."
                  className="w-full pl-10 pr-4 py-3 bg-white border border-[#E5E7EB] rounded-lg text-[#1F2937] placeholder-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                />
              </div>
              <button
                onClick={getUserLocation}
                disabled={locationLoading}
                className="px-4 py-3 bg-white border border-[#E5E7EB] rounded-lg text-[#6B7280] hover:border-[#1877F2] hover:text-[#1877F2] transition-colors min-w-[48px] inline-flex items-center justify-center"
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
              <p className="text-sm text-[#6B7280] mt-2 flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                Showing venues near you
              </p>
            )}
          </section>

          {/* Venues */}
          <section>
            <h2 className="text-lg font-semibold text-[#1F2937] mb-3">
              Venues with Live Games
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-lg border border-[#E5E7EB] p-4 animate-pulse">
                    <div className="h-5 bg-[#E5E7EB] rounded w-1/3 mb-2" />
                    <div className="h-4 bg-[#E5E7EB] rounded w-1/4" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-[#EF4444]" />
                <p className="text-[#6B7280]">{error}</p>
                <button
                  onClick={fetchVenues}
                  className="mt-4 px-4 py-2 bg-[#1877F2] text-white rounded-lg font-medium hover:bg-[#1664d9] transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : filteredVenues.length === 0 ? (
              <div className="bg-white rounded-lg border border-[#E5E7EB] p-6 text-center">
                <p className="text-[#6B7280]">
                  {searchQuery
                    ? 'No venues match your search'
                    : 'No venues with live games found'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
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
        </main>
      </div>
    </>
  );
}
