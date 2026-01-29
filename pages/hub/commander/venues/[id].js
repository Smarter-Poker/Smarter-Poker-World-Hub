/**
 * Venue Detail Page
 * View venue info, live games, waitlist, and promotions
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  DollarSign,
  Phone,
  Globe,
  Star,
  ChevronRight,
  Gift,
  Trophy,
  Loader2
} from 'lucide-react';

function GameRow({ game, onJoinWaitlist }) {
  const isFull = (game.player_count || 0) >= (game.max_players || 9);
  const waitlistCount = game.waitlist_count || 0;

  return (
    <div className="flex items-center justify-between p-4 border-b border-[#4A5E78] last:border-b-0">
      <div>
        <p className="font-medium text-white">
          {game.stakes} {game.game_type?.toUpperCase() || 'NLHE'}
        </p>
        <div className="flex items-center gap-3 text-sm text-[#64748B]">
          <span>Table {game.table_number}</span>
          <span>{game.player_count || 0}/{game.max_players || 9} players</span>
          {waitlistCount > 0 && (
            <span className="text-[#F59E0B]">{waitlistCount} waiting</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onJoinWaitlist?.(game)}
        className={
          isFull
            ? 'bg-[#F59E0B] text-white hover:bg-[#D97706] px-4 py-2 rounded-lg text-sm font-medium transition-colors'
            : 'cmd-btn cmd-btn-primary px-4 py-2 text-sm transition-colors'
        }
      >
        {isFull ? 'Join Waitlist' : 'Sit Now'}
      </button>
    </div>
  );
}

export default function VenueDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      const [venueRes, gamesRes, promosRes] = await Promise.all([
        fetch(`/api/commander/venues/${id}`),
        fetch(`/api/commander/games/venue/${id}`),
        fetch(`/api/commander/promotions?venue_id=${id}&active=true`)
      ]);

      const venueData = await venueRes.json();
      const gamesData = await gamesRes.json();
      const promosData = await promosRes.json();

      if (venueData.success || venueData.venue) {
        setVenue(venueData.venue || venueData.data?.venue);
      }
      if (gamesData.success) {
        setGames(gamesData.data?.games || []);
      }
      if (promosData.success) {
        setPromotions(promosData.data?.promotions || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setVenue(null);
      setGames([]);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleJoinWaitlist(game) {
    router.push(`/hub/commander/waitlist/${id}?game=${game.id}`);
  }

  function handleCheckIn() {
    router.push(`/hub/commander/check-in/${id}`);
  }

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="cmd-page flex items-center justify-center p-4">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
          <p className="text-[#64748B]">Venue not found</p>
        </div>
      </div>
    );
  }

  const activeGames = games.filter(g => g.status !== 'closed');

  return (
    <>
      <Head>
        <title>{venue.name} | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full text-white">
          <div className="max-w-lg mx-auto px-4 py-4">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-white/80 hover:text-white mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>

            <h1 className="text-2xl font-bold">{venue.name}</h1>
            <p className="text-white/80 flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" />
              {venue.city}, {venue.state}
            </p>

            {venue.rating && (
              <div className="flex items-center gap-1 mt-2">
                <Star className="w-5 h-5 text-[#F59E0B] fill-[#F59E0B]" />
                <span className="font-medium">{venue.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Check-In Button */}
          <button
            onClick={handleCheckIn}
            className="cmd-btn cmd-btn-primary w-full h-14 text-lg flex items-center justify-center gap-2"
          >
            <Users className="w-6 h-6" />
            Check In
          </button>

          {/* Venue Info */}
          <div className="cmd-panel overflow-hidden">
            <div className="p-4 border-b border-[#4A5E78]">
              <h2 className="font-semibold text-white">Info</h2>
            </div>
            <div className="divide-y divide-[#4A5E78]">
              {venue.address && (
                <div className="flex items-center gap-3 p-4">
                  <MapPin className="w-5 h-5 text-[#64748B]" />
                  <span className="text-white">{venue.address}</span>
                </div>
              )}
              {venue.phone && (
                <a href={`tel:${venue.phone}`} className="flex items-center gap-3 p-4 hover:bg-[#132240]">
                  <Phone className="w-5 h-5 text-[#64748B]" />
                  <span className="text-[#22D3EE]">{venue.phone}</span>
                </a>
              )}
              {venue.hours && (
                <div className="flex items-center gap-3 p-4">
                  <Clock className="w-5 h-5 text-[#64748B]" />
                  <span className="text-white">{venue.hours}</span>
                </div>
              )}
              {venue.total_tables && (
                <div className="flex items-center gap-3 p-4">
                  <Users className="w-5 h-5 text-[#64748B]" />
                  <span className="text-white">{venue.total_tables} tables</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Games */}
          <div className="cmd-panel overflow-hidden">
            <div className="p-4 border-b border-[#4A5E78] flex items-center justify-between">
              <h2 className="font-semibold text-white">Live Games</h2>
              <span className="text-sm text-[#64748B]">{activeGames.length} running</span>
            </div>
            {activeGames.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                <p className="text-[#64748B]">No games running</p>
              </div>
            ) : (
              <div>
                {activeGames.map((game) => (
                  <GameRow
                    key={game.id}
                    game={game}
                    onJoinWaitlist={handleJoinWaitlist}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Promotions */}
          {promotions.length > 0 && (
            <div className="cmd-panel overflow-hidden">
              <div className="p-4 border-b border-[#4A5E78]">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Active Promotions
                </h2>
              </div>
              <div className="divide-y divide-[#4A5E78]">
                {promotions.map((promo) => (
                  <div key={promo.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">{promo.name}</p>
                      <p className="text-sm text-[#64748B]">{promo.frequency}</p>
                    </div>
                    <span className="text-lg font-bold text-[#10B981]">
                      ${promo.prize_amount?.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {venue.description && (
            <div className="cmd-panel p-4">
              <h2 className="font-semibold text-white mb-2">About</h2>
              <p className="text-[#64748B]">{venue.description}</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
