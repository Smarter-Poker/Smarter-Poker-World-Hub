/**
 * Venue Detail Page
 * View venue info, live games, waitlist, and promotions
 * UI: Facebook color scheme, no emojis, Inter font
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
    <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB] last:border-b-0">
      <div>
        <p className="font-medium text-[#1F2937]">
          {game.stakes} {game.game_type?.toUpperCase() || 'NLHE'}
        </p>
        <div className="flex items-center gap-3 text-sm text-[#6B7280]">
          <span>Table {game.table_number}</span>
          <span>{game.player_count || 0}/{game.max_players || 9} players</span>
          {waitlistCount > 0 && (
            <span className="text-[#F59E0B]">{waitlistCount} waiting</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onJoinWaitlist?.(game)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
          isFull
            ? 'bg-[#F59E0B] text-white hover:bg-[#D97706]'
            : 'bg-[#10B981] text-white hover:bg-[#059669]'
        }`}
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
        fetch(`/api/club-commander/venues/${id}`),
        fetch(`/api/club-commander/games/venue/${id}`),
        fetch(`/api/club-commander/promotions?venue_id=${id}&active=true`)
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
      // Mock data
      setVenue({
        id: 1,
        name: 'Bellagio Poker Room',
        city: 'Las Vegas',
        state: 'NV',
        address: '3600 S Las Vegas Blvd',
        phone: '702-693-7111',
        website: 'https://bellagio.mgmresorts.com/poker',
        hours: '24/7',
        rating: 4.8,
        total_tables: 40,
        description: 'World-famous poker room featuring high stakes action and regular tournaments.'
      });
      setGames([
        { id: 1, stakes: '$1/$3', game_type: 'nlhe', table_number: 1, player_count: 9, max_players: 9, waitlist_count: 5 },
        { id: 2, stakes: '$2/$5', game_type: 'nlhe', table_number: 3, player_count: 8, max_players: 9, waitlist_count: 3 },
        { id: 3, stakes: '$5/$10', game_type: 'nlhe', table_number: 5, player_count: 6, max_players: 9, waitlist_count: 0 },
        { id: 4, stakes: '$1/$2', game_type: 'plo', table_number: 7, player_count: 7, max_players: 9, waitlist_count: 2 },
      ]);
      setPromotions([
        { id: 1, name: 'High Hand Bonus', prize_amount: 500, frequency: 'hourly', is_active: true },
        { id: 2, name: 'Bad Beat Jackpot', prize_amount: 150000, frequency: 'progressive', is_active: true }
      ]);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleJoinWaitlist(game) {
    router.push(`/hub/club-commander/waitlist/${id}?game=${game.id}`);
  }

  function handleCheckIn() {
    router.push(`/hub/club-commander/check-in/${id}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="text-center">
          <MapPin className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
          <p className="text-[#6B7280]">Venue not found</p>
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

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
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
            className="w-full h-14 bg-[#10B981] text-white text-lg font-semibold rounded-xl hover:bg-[#059669] transition-colors flex items-center justify-center gap-2"
          >
            <Users className="w-6 h-6" />
            Check In
          </button>

          {/* Venue Info */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB]">
              <h2 className="font-semibold text-[#1F2937]">Info</h2>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
              {venue.address && (
                <div className="flex items-center gap-3 p-4">
                  <MapPin className="w-5 h-5 text-[#6B7280]" />
                  <span className="text-[#1F2937]">{venue.address}</span>
                </div>
              )}
              {venue.phone && (
                <a href={`tel:${venue.phone}`} className="flex items-center gap-3 p-4 hover:bg-[#F9FAFB]">
                  <Phone className="w-5 h-5 text-[#6B7280]" />
                  <span className="text-[#1877F2]">{venue.phone}</span>
                </a>
              )}
              {venue.hours && (
                <div className="flex items-center gap-3 p-4">
                  <Clock className="w-5 h-5 text-[#6B7280]" />
                  <span className="text-[#1F2937]">{venue.hours}</span>
                </div>
              )}
              {venue.total_tables && (
                <div className="flex items-center gap-3 p-4">
                  <Users className="w-5 h-5 text-[#6B7280]" />
                  <span className="text-[#1F2937]">{venue.total_tables} tables</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Games */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <h2 className="font-semibold text-[#1F2937]">Live Games</h2>
              <span className="text-sm text-[#6B7280]">{activeGames.length} running</span>
            </div>
            {activeGames.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                <p className="text-[#6B7280]">No games running</p>
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
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h2 className="font-semibold text-[#1F2937] flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Active Promotions
                </h2>
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {promotions.map((promo) => (
                  <div key={promo.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#1F2937]">{promo.name}</p>
                      <p className="text-sm text-[#6B7280]">{promo.frequency}</p>
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
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <h2 className="font-semibold text-[#1F2937] mb-2">About</h2>
              <p className="text-[#6B7280]">{venue.description}</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
