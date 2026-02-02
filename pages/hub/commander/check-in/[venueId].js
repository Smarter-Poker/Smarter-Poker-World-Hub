/**
 * Player Check-In Page
 * Players scan QR or enter code to check in at venue
 * UI: Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  CheckCircle,
  MapPin,
  Users,
  Gift,
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
        fetch(`/api/commander/venues/${venueId}`),
        fetch(`/api/commander/games/venue/${venueId}`),
        fetch(`/api/commander/promotions?venue_id=${venueId}&active=true`)
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
      router.push(`/auth/login?redirect=/hub/commander/check-in/${venueId}`);
      return;
    }

    setCheckingIn(true);
    setError(null);

    try {
      const res = await fetch('/api/commander/sessions', {
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
    router.push(`/hub/commander/waitlist/${venueId}`);
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
          <AlertCircle className="w-12 h-12 text-[#EF4444] mx-auto mb-3" />
          <p className="text-white font-medium">Venue not found</p>
          <p className="text-sm text-[#64748B] mt-1">Please check the QR code and try again</p>
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

        <div className="cmd-page flex items-center justify-center p-4">
          <div className="text-center text-white">
            <div className="cmd-icon-box cmd-icon-box-glow mx-auto mb-6" style={{ width: 80, height: 80, borderColor: '#10B981', boxShadow: '0 0 20px rgba(16, 185, 129, 0.4), 0 0 40px rgba(16, 185, 129, 0.15), inset 0 0 15px rgba(16, 185, 129, 0.1), inset 0 2px 6px rgba(0,0,0,0.4)' }}>
              <CheckCircle className="w-10 h-10 text-[#10B981]" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-wider mb-2" style={{ textShadow: '0 0 15px rgba(16, 185, 129, 0.5), 0 0 30px rgba(16, 185, 129, 0.2)' }}>You're Checked In!</h1>
            <p className="text-[#64748B] mb-6">Welcome to {venue.name}</p>

            <div className="cmd-panel mb-6" style={{ borderColor: '#10B981', boxShadow: '0 0 20px rgba(16, 185, 129, 0.15), 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(16, 185, 129, 0.15), inset 0 -2px 0 rgba(0,0,0,0.3)' }}>
              <p className="text-sm text-[#64748B] mb-1">Your session has started</p>
              <p className="text-lg font-semibold text-[#10B981]" style={{ textShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}>{new Date().toLocaleTimeString()}</p>
            </div>

            <button
              onClick={handleJoinWaitlist}
              className="cmd-btn cmd-btn-success w-full max-w-xs mx-auto"
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

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full p-6">
          <div className="max-w-lg mx-auto text-center">
            <div className="cmd-icon-box cmd-icon-box-glow mx-auto mb-3">
              <MapPin className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-extrabold text-white tracking-wider">{venue.name}</h1>
            {venue.city && (
              <p className="text-[#64748B] mt-1">{venue.city}, {venue.state}</p>
            )}
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {error && (
            <div className="p-4 bg-[#EF4444]/10 border-2 border-[#EF4444] rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#EF4444] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Check-in Button */}
          <div className="cmd-panel text-center">
            <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-2">Ready to Play?</h2>
            <p className="text-sm text-[#64748B] mb-4">
              Check in to start tracking your session and earn rewards
            </p>
            <button
              onClick={handleCheckIn}
              disabled={checkingIn}
              className="cmd-btn cmd-btn-primary w-full disabled:opacity-50"
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
            <div className="cmd-panel overflow-hidden !p-0">
              <div className="p-4 border-b border-[#4A5E78]">
                <h3 className="font-bold text-white uppercase tracking-wide text-sm flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#22D3EE]" />
                  Live Games ({activeGames.length})
                </h3>
              </div>
              <div className="divide-y divide-[#4A5E78]">
                {activeGames.slice(0, 5).map((game) => (
                  <div key={game.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">
                        {game.stakes} {game.game_type?.toUpperCase()}
                      </p>
                      <p className="text-sm text-[#64748B]">
                        Table {game.table_number}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {game.player_count || 0}/{game.max_players}
                      </p>
                      <p className="text-sm text-[#64748B]">players</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 bg-[#0F1C32]">
                <button
                  onClick={handleJoinWaitlist}
                  className="cmd-btn cmd-btn-secondary w-full"
                >
                  View Waitlist
                </button>
              </div>
            </div>
          )}

          {/* Active Promotions */}
          {activePromos.length > 0 && (
            <div className="cmd-panel overflow-hidden !p-0">
              <div className="p-4 border-b border-[#4A5E78]">
                <h3 className="font-bold text-white uppercase tracking-wide text-sm flex items-center gap-2">
                  <Gift className="w-5 h-5 text-[#F59E0B]" />
                  Active Promotions
                </h3>
              </div>
              <div className="divide-y divide-[#4A5E78]">
                {activePromos.slice(0, 3).map((promo) => (
                  <div key={promo.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-white">{promo.name}</p>
                        <p className="text-sm text-[#64748B]">{promo.frequency}</p>
                      </div>
                      <span className="text-lg font-bold text-[#10B981]" style={{ textShadow: '0 0 10px rgba(16, 185, 129, 0.4)' }}>
                        ${promo.prize_amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-center text-sm text-[#64748B]">
            <p>By checking in, you agree to the venue's terms and conditions.</p>
            <p className="mt-1">Need help? Ask any staff member.</p>
          </div>
        </main>
      </div>
    </>
  );
}
