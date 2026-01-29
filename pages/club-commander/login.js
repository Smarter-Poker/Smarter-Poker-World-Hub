/**
 * Club Commander Staff Login Page - Venue selection + PIN entry
 * Based on PokerAtlas TableCaptain / Bravo Poker patterns
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { KeyRound, Loader2, MapPin, ChevronRight, ArrowLeft } from 'lucide-react';

export default function ClubCommanderLogin() {
  const router = useRouter();
  const { venue_id: queryVenueId } = router.query;

  const [step, setStep] = useState('venue'); // 'venue' or 'pin'
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  // Fetch club-commander-enabled venues
  useEffect(() => {
    fetchVenues();
  }, []);

  // If venue_id in query, auto-select it
  useEffect(() => {
    if (queryVenueId && venues.length > 0) {
      const venue = venues.find(v => v.id === parseInt(queryVenueId));
      if (venue) {
        setSelectedVenue(venue);
        setStep('pin');
      }
    }
  }, [queryVenueId, venues]);

  async function fetchVenues() {
    try {
      const res = await fetch('/api/club-commander/venues?captain_enabled=true');
      const data = await res.json();
      if (data.success) {
        setVenues(data.data.venues || []);
      }
    } catch (err) {
      console.error('Failed to fetch venues:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleVenueSelect(venue) {
    setSelectedVenue(venue);
    setStep('pin');
    setError(null);
  }

  function handleBackToVenues() {
    setStep('venue');
    setSelectedVenue(null);
    setPin('');
    setError(null);
  }

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (pin.length < 4) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/club-commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: selectedVenue.id, pin_code: pin })
      });

      const data = await res.json();

      if (data.success && data.data.valid) {
        // Store staff session with venue info
        localStorage.setItem('club_commander_staff', JSON.stringify({
          ...data.data.staff,
          permissions: data.data.permissions,
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name
        }));
        router.push('/club-commander/dashboard');
      } else {
        setError('Invalid PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handlePinInput(digit) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      setError(null);

      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        setTimeout(() => {
          handleSubmit();
        }, 200);
      }
    }
  }

  function handleBackspace() {
    setPin(prev => prev.slice(0, -1));
  }

  function handleClear() {
    setPin('');
  }

  // Venue Selection Screen
  if (step === 'venue') {
    return (
      <>
        <Head>
          <title>Staff Login | Smarter Club Commander</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>

        <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-start p-4 pt-12">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#1877F2] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-[#1F2937]">Staff Login</h1>
              <p className="text-[#6B7280] mt-1">Select your venue to continue</p>
            </div>

            {/* Venue List */}
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#1877F2] mx-auto" />
                  <p className="text-[#6B7280] mt-2">Loading venues...</p>
                </div>
              ) : venues.length === 0 ? (
                <div className="p-8 text-center">
                  <MapPin className="w-8 h-8 text-[#9CA3AF] mx-auto mb-2" />
                  <p className="text-[#6B7280]">No venues available</p>
                  <p className="text-sm text-[#9CA3AF] mt-1">Contact admin to enable Club Commander</p>
                </div>
              ) : (
                <div className="divide-y divide-[#E5E7EB]">
                  {venues.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => handleVenueSelect(venue)}
                      className="w-full p-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors text-left"
                    >
                      <div>
                        <h3 className="font-semibold text-[#1F2937]">{venue.name}</h3>
                        <p className="text-sm text-[#6B7280]">{venue.city}, {venue.state}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // PIN Entry Screen
  return (
    <>
      <Head>
        <title>Staff Login | Smarter Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Back Button */}
          {!queryVenueId && (
            <button
              onClick={handleBackToVenues}
              className="flex items-center gap-2 text-[#6B7280] hover:text-[#1F2937] mb-6 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Change Venue</span>
            </button>
          )}

          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#1877F2] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937]">Enter PIN</h1>
            <p className="text-[#6B7280] mt-1">{selectedVenue?.name}</p>
          </div>

          {/* PIN Display */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 mb-4">
            <div className="flex justify-center gap-4 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-colors ${
                    pin.length > i ? 'bg-[#1877F2]' : 'bg-[#E5E7EB]'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-[#FEF2F2] rounded-lg text-center">
                <p className="text-sm text-[#EF4444]">{error}</p>
              </div>
            )}

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinInput(digit.toString())}
                  disabled={verifying}
                  className="h-16 rounded-xl bg-[#F9FAFB] text-2xl font-semibold text-[#1F2937] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#F9FAFB] text-sm font-medium text-[#6B7280] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handlePinInput('0')}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#F9FAFB] text-2xl font-semibold text-[#1F2937] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#F9FAFB] text-sm font-medium text-[#6B7280] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                Back
              </button>
            </div>

            {/* Login Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={verifying || pin.length < 4}
              className="w-full mt-4 h-14 rounded-xl bg-[#1877F2] text-white text-lg font-semibold hover:bg-[#1664d9] active:bg-[#1558c2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? 'Verifying...' : 'Login'}
            </button>
          </div>

          {/* Loading indicator */}
          {verifying && (
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#1877F2] mx-auto" />
              <p className="text-sm text-[#6B7280] mt-2">Verifying...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
