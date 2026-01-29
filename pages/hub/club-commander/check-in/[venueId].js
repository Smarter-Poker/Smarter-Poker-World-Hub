/**
 * Player Check-In Page
 * Players scan QR or enter code to check in at venue
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  CheckCircle,
  MapPin,
  Clock,
  Users,
  DollarSign,
  Gift,
  Trophy,
  Loader2,
  AlertCircle
} from 'lucide-react';

export default function PlayerCheckInPage() {
  const router = useRouter();
  const { venueId } = router.query;

  const [venue, setVenue] = useState(null);
  const [games, setGames] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (venueId) {
      fetchVenueData();
    }
  }, [venueId]);

  async function fetchVenueData() {
    try {
      const [venueRes, gamesRes, promosRes] = await Promise.all([
        fetch(`/api/club-commander/venues/${venueId}`),
        fetch(`/api/club-commander/games/venue/${venueId}`),
        fetch(`/api/club-commander/promotions?venue_id=${venueId}&active=true`)
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
      setError('Unable to load venue information');
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckIn() {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push(`/login?redirect=/hub/club-commander/check-in/${venueId}`);
      return;
    }

    setCheckingIn(true);
    setError(null);

    try {
      const res = await fetch('/api/club-commander/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: venueId,
          check_in_type: 'self_service'
        })
      });

      const data = await res.json();

      if (data.success) {
        setCheckedIn(true);
      } else {
        setError(data.error?.message || 'Check-in failed. Please see staff.');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  }

  function handleJoinWaitlist() {
    router.push(`/hub/club-commander/waitlist/${venueId}`);
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
          <AlertCircle className="w-12 h-12 text-[#EF4444] mx-auto mb-3" />
          <p className="text-[#1F2937] font-medium">Venue not found</p>
          <p className="text-sm text-[#6B7280] mt-1">Please check the QR code and try again</p>
        </div>
      </div>
    );
  }

  if (checkedIn) {
    return (
      <>
        <Head>
          <title>Checked In | {venue.name}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>

        <div className="min-h-screen bg-[#10B981] flex items-center justify-center p-4">
          <div className="text-center text-white">
            <CheckCircle className="w-20 h-20 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">You're Checked In!</h1>
            <p className="text-white/80 mb-6">Welcome to {venue.name}</p>

            <div className="bg-white/10 rounded-xl p-4 mb-6">
              <p className="text-sm text-white/80 mb-1">Your session has started</p>
              <p className="text-lg font-semibold">{new Date().toLocaleTimeString()}</p>
            </div>

            <button
              onClick={handleJoinWaitlist}
              className="w-full max-w-xs mx-auto h-12 bg-white text-[#10B981] font-semibold rounded-lg hover:bg-white/90 transition-colors"
            >
              Join a Game Waitlist
            </button>
          </div>
        </div>
      </>
    );
  }

  const activeGames = games.filter(g => g.status === 'running');
  const activePromos = promotions.filter(p => p.is_active);

  return (
    <>
      <Head>
        <title>Check In | {venue.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white p-6">
          <div className="max-w-lg mx-auto text-center">
            <MapPin className="w-8 h-8 mx-auto mb-2" />
            <h1 className="text-2xl font-bold">{venue.name}</h1>
            {venue.city && (
              <p className="text-white/80">{venue.city}, {venue.state}</p>
            )}
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {error && (
            <div className="p-4 bg-[#FEF2F2] rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Check-in Button */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 text-center">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-2">Ready to Play?</h2>
            <p className="text-sm text-[#6B7280] mb-4">
              Check in to start tracking your session and earn rewards
            </p>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="w-full h-14 bg-[#1877F2] text-white text-lg font-semibold rounded-xl hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {checkingIn ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <CheckCircle className="w-6 h-6" />
                  Check In Now
                </>
              )}
            </button>
          </div>

          {/* Live Games */}
          {activeGames.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold text-[#1F2937] flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#1877F2]" />
                  Live Games ({activeGames.length})
                </h3>
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {activeGames.slice(0, 5).map((game) => (
                  <div key={game.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-[#1F2937]">
                        {game.stakes} {game.game_type?.toUpperCase()}
                      </p>
                      <p className="text-sm text-[#6B7280]">
                        Table {game.table_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-[#1F2937]">
                        {game.player_count || 0}/{game.max_players}
                      </p>
                      <p className="text-sm text-[#6B7280]">players</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-[#F9FAFB]">
                <button
                  onClick={handleJoinWaitlist}
                  className="w-full h-10 border border-[#1877F2] text-[#1877F2] font-medium rounded-lg hover:bg-[#1877F2]/5 transition-colors"
                >
                  View Waitlist
                </button>
              </div>
            </div>
          )}

          {/* Active Promotions */}
          {activePromos.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              <div className="p-4 border-b border-[#E5E7EB]">
                <h3 className="font-semibold text-[#1F2937] flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Active Promotions
                </h3>
              </div>
              <div className="divide-y divide-[#E5E7EB]">
                {activePromos.slice(0, 3).map((promo) => (
                  <div key={promo.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-[#1F2937]">{promo.name}</p>
                        <p className="text-sm text-[#6B7280]">{promo.frequency}</p>
                      </div>
                      <span className="text-lg font-bold text-[#10B981]">
                        ${promo.prize_amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-center text-sm text-[#6B7280]">
            <p>By checking in, you agree to the venue's terms and conditions.</p>
            <p className="mt-1">Need help? Ask any staff member.</p>
          </div>
        </main>
      </div>
    </>
  );
}
