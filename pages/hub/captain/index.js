/**
 * Player Captain Hub - Browse venues and manage waitlists
 * Reference: SCOPE_LOCK.md - Phase 1 UI Pages
 * UI: Facebook color scheme with futuristic metallic styling
 */
import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { MapPin, Search, RefreshCw, AlertCircle, Trophy, FileText, Shield, ChevronRight, Zap, Loader2 } from 'lucide-react';
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
        {/* Futuristic Header */}
        <header className="captain-header sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="captain-icon-box-glow">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#1F2937] tracking-wide">Live Poker</h1>
                <p className="text-sm text-[#6B7280]">Find games and join waitlists</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Quick Links */}
          <section className="grid grid-cols-3 gap-3">
            <Link
              href="/hub/captain/leagues"
              className="captain-card p-4 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-12 h-12 mx-auto mb-3 group-hover:captain-icon-box-glow transition-all">
                <Trophy className="w-6 h-6" />
              </div>
              <p className="font-bold text-[#1F2937] group-hover:text-[#1877F2] transition-colors">Leagues</p>
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mt-1">Compete</p>
            </Link>
            <Link
              href="/hub/captain/hand-history"
              className="captain-card p-4 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-12 h-12 mx-auto mb-3 group-hover:captain-icon-box-glow transition-all">
                <FileText className="w-6 h-6" />
              </div>
              <p className="font-bold text-[#1F2937] group-hover:text-[#1877F2] transition-colors">Hands</p>
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mt-1">Review</p>
            </Link>
            <Link
              href="/hub/captain/responsible-gaming"
              className="captain-card p-4 hover:captain-card-glow transition-all group text-center"
            >
              <div className="captain-icon-box w-12 h-12 mx-auto mb-3 group-hover:captain-icon-box-glow transition-all">
                <Shield className="w-6 h-6" />
              </div>
              <p className="font-bold text-[#1F2937] group-hover:text-[#1877F2] transition-colors">Limits</p>
              <p className="text-xs text-[#6B7280] font-medium uppercase tracking-wide mt-1">Settings</p>
            </Link>
          </section>

          {/* My Waitlists */}
          {myWaitlists.length > 0 && (
            <section>
              <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="captain-status-live">My Waitlists</span>
              </h2>
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
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search venues..."
                  className="captain-input pl-12"
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
              <div className="mt-3">
                <span className="captain-badge captain-badge-success">
                  <MapPin className="w-3 h-3" />
                  Showing venues near you
                </span>
              </div>
            )}
          </section>

          {/* Venues */}
          <section>
            <h2 className="text-xs font-bold text-[#6B7280] uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="captain-status-live">Venues with Live Games</span>
            </h2>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="captain-card p-5 animate-pulse">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#E5E7EB] rounded-xl" />
                      <div className="flex-1">
                        <div className="h-5 bg-[#E5E7EB] rounded w-1/3 mb-2" />
                        <div className="h-4 bg-[#E5E7EB] rounded w-1/4" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="captain-card p-8 text-center">
                <div className="captain-icon-box mx-auto mb-4" style={{ borderColor: '#EF4444' }}>
                  <AlertCircle className="w-6 h-6 text-[#EF4444]" />
                </div>
                <p className="text-[#6B7280] font-medium">{error}</p>
                <button
                  onClick={fetchVenues}
                  className="captain-btn captain-btn-primary mt-4"
                >
                  Retry
                </button>
              </div>
            ) : filteredVenues.length === 0 ? (
              <div className="captain-card p-8 text-center">
                <div className="captain-icon-box mx-auto mb-4">
                  <MapPin className="w-6 h-6" />
                </div>
                <p className="text-[#6B7280] font-medium">
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
