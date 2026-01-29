/**
 * Player Venue Discovery Page
 * Find and view poker rooms using Smarter Captain
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  MapPin,
  Search,
  Users,
  Clock,
  DollarSign,
  ChevronRight,
  Star,
  Filter,
  Loader2,
  Navigation
} from 'lucide-react';

function VenueCard({ venue, onSelect }) {
  const hasActiveGames = (venue.active_games || 0) > 0;

  return (
    <button
      onClick={() => onSelect?.(venue)}
      className="w-full cap-panel p-4 text-left hover:border-[#22D3EE]/30 transition-shadow"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-semibold text-white">{venue.name}</h3>
          <p className="text-sm text-[#64748B] flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {venue.city}, {venue.state}
          </p>
        </div>
        {hasActiveGames && (
          <span className="cap-badge cap-badge-live">
            LIVE
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-[#64748B] mb-3">
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {venue.active_games || 0} games
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {venue.waitlist_count || 0} waiting
        </span>
        {venue.distance && (
          <span className="flex items-center gap-1">
            <Navigation className="w-4 h-4" />
            {venue.distance} mi
          </span>
        )}
      </div>

      {venue.stakes_spread && (
        <div className="flex gap-2 mb-3">
          {venue.stakes_spread.slice(0, 3).map((stake, i) => (
            <span key={i} className="px-2 py-1 bg-[#0D192E] text-white text-xs font-medium rounded">
              {stake}
            </span>
          ))}
          {venue.stakes_spread.length > 3 && (
            <span className="px-2 py-1 bg-[#0D192E] text-[#64748B] text-xs rounded">
              +{venue.stakes_spread.length - 3} more
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-[#4A5E78]">
        <div className="flex items-center gap-1">
          {venue.rating && (
            <>
              <Star className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]" />
              <span className="text-sm font-medium text-white">{venue.rating.toFixed(1)}</span>
            </>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-[#4A5E78]" />
      </div>
    </button>
  );
}

export default function VenueDiscoveryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'live', 'nearby'

  useEffect(() => {
    fetchVenues();
  }, [filter]);

  async function fetchVenues() {
    setLoading(true);
    try {
      const res = await fetch(`/api/captain/venues?filter=${filter}`);
      const data = await res.json();

      if (data.success) {
        setVenues(data.data?.venues || []);
      }
    } catch (err) {
      console.error('Fetch venues failed:', err);
      setVenues([]);
    } finally {
      setLoading(false);
    }
  }

  function handleVenueSelect(venue) {
    router.push(`/hub/captain/check-in/${venue.id}`);
  }

  const filteredVenues = venues.filter(v => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      v.name.toLowerCase().includes(query) ||
      v.city.toLowerCase().includes(query) ||
      v.state.toLowerCase().includes(query)
    );
  });

  return (
    <>
      <Head>
        <title>Find Poker Rooms | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Header */}
        <header className="cap-header-full text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="cap-icon-box cap-icon-box-glow">
                <MapPin className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-bold">Find Poker Rooms</h1>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or city..."
                className="w-full h-12 pl-12 pr-4 cap-input"
              />
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { value: 'all', label: 'All Venues' },
              { value: 'live', label: 'Live Games' },
              { value: 'nearby', label: 'Nearby' }
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  filter === value
                    ? 'bg-[#132240] text-[#22D3EE] border-2 border-[#22D3EE]'
                    : 'bg-[#0F1C32] text-[#64748B] border-2 border-[#4A5E78]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Venues List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : filteredVenues.length === 0 ? (
            <div className="cap-panel p-8 text-center">
              <MapPin className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
              <p className="text-[#64748B]">No venues found</p>
              <p className="text-sm text-[#4A5E78] mt-1">
                Try adjusting your search or filters
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVenues.map((venue) => (
                <VenueCard
                  key={venue.id}
                  venue={venue}
                  onSelect={handleVenueSelect}
                />
              ))}
            </div>
          )}

          {/* Info */}
          <div className="text-center text-sm text-[#64748B] pt-4">
            <p>Tap a venue to check in and join waitlists</p>
          </div>
        </main>
      </div>
    </>
  );
}
