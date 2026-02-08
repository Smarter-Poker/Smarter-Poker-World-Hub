/**
 * Commander Staff Login Page - Venue selection + PIN entry
 * Facebook color scheme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { KeyRound, Loader2, MapPin, ChevronRight, ArrowLeft } from 'lucide-react';

export default function CommanderLogin() {
  const router = useRouter();
  const { venue_id: queryVenueId } = router.query;

  const [step, setStep] = useState('venue');
  const [venues, setVenues] = useState([]);
  const [selectedVenue, setSelectedVenue] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchVenues();
  }, []);

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
      const res = await fetch('/api/commander/venues?commander_enabled=true');
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

  function handlePinInput(digit) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => handleSubmit(null, newPin), 100);
      }
    }
  }

  function handleBackspace() {
    setPin(pin.slice(0, -1));
  }

  function handleClear() {
    setPin('');
  }

  async function handleSubmit(e, pinToSubmit) {
    if (e) e.preventDefault();
    const submitPin = pinToSubmit || pin;
    if (submitPin.length < 4) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: selectedVenue.id, pin_code: submitPin })
      });

      const data = await res.json();

      if (data.success && data.data.valid) {
        localStorage.setItem('commander_staff', JSON.stringify({
          ...data.data.staff,
          permissions: data.data.permissions,
          venue_id: selectedVenue.id,
          venue_name: selectedVenue.name
        }));
        router.push('/commander/dashboard');
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

  // Venue Selection Screen
  if (step === 'venue') {
    return (
      <>
        <Head>
          <title>Select Venue | Club Commander</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        </Head>

        <div className="min-h-screen bg-[#18191A] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-[#1877F2] rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl text-white">&#9824;</span>
              </div>
              <h1 className="text-2xl font-bold text-[#E4E6EB]">Club Commander</h1>
              <p className="text-[#B0B3B8] mt-1">Select your venue to continue</p>
            </div>

            {/* Venue List */}
            <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] overflow-hidden">
              {loading ? (
                <div className="p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#1877F2] mx-auto" />
                  <p className="text-[#B0B3B8] mt-2">Loading venues...</p>
                </div>
              ) : venues.length === 0 ? (
                <div className="p-8 text-center">
                  <MapPin className="w-8 h-8 text-[#B0B3B8] mx-auto mb-2" />
                  <p className="text-[#B0B3B8]">No venues available</p>
                  <p className="text-sm text-[#B0B3B8] mt-1">Contact admin to enable Commander</p>
                </div>
              ) : (
                <div className="divide-y divide-[#3A3B3C]">
                  {venues.map((venue) => (
                    <button
                      key={venue.id}
                      onClick={() => handleVenueSelect(venue)}
                      className="w-full p-4 flex items-center justify-between hover:bg-[#3A3B3C] transition-colors text-left"
                    >
                      <div>
                        <h3 className="font-semibold text-[#E4E6EB]">{venue.name}</h3>
                        <p className="text-sm text-[#B0B3B8]">{venue.city}, {venue.state}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
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
        <title>Staff Login | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#18191A] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Back Button */}
          {!queryVenueId && (
            <button
              onClick={handleBackToVenues}
              className="flex items-center gap-2 text-[#B0B3B8] hover:text-[#E4E6EB] mb-6 transition-colors"
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
            <h1 className="text-2xl font-bold text-[#E4E6EB]">Enter PIN</h1>
            <p className="text-[#B0B3B8] mt-1">{selectedVenue?.name}</p>
          </div>

          {/* PIN Display */}
          <div className="bg-[#242526] rounded-xl border border-[#3A3B3C] p-6 mb-4">
            <div className="flex justify-center gap-4 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full transition-colors ${
                    pin.length > i ? 'bg-[#1877F2]' : 'bg-[#3A3B3C]'
                  }`}
                />
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                <p className="text-sm text-red-400">{error}</p>
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
                  className="h-16 rounded-xl bg-[#3A3B3C] text-2xl font-semibold text-[#E4E6EB] hover:bg-[#4E4F50] active:bg-[#606060] transition-colors disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#3A3B3C] text-sm font-medium text-[#B0B3B8] hover:bg-[#4E4F50] active:bg-[#606060] transition-colors disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handlePinInput('0')}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#3A3B3C] text-2xl font-semibold text-[#E4E6EB] hover:bg-[#4E4F50] active:bg-[#606060] transition-colors disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={verifying}
                className="h-16 rounded-xl bg-[#3A3B3C] text-sm font-medium text-[#B0B3B8] hover:bg-[#4E4F50] active:bg-[#606060] transition-colors disabled:opacity-50"
              >
                Back
              </button>
            </div>

            {/* Login Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={verifying || pin.length < 4}
              className="w-full mt-4 h-14 rounded-xl text-lg font-semibold bg-[#1877F2] hover:bg-[#166FE5] text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {verifying ? 'Verifying...' : 'Login'}
            </button>
          </div>

          {/* Loading indicator */}
          {verifying && (
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[#1877F2] mx-auto" />
              <p className="text-sm text-[#B0B3B8] mt-2">Verifying...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
