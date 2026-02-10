/**
 * Commander Staff Login Page - PIN entry only
 * Requires venue_id in URL - no venue picker
 * Facebook color scheme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';

export default function CommanderLogin() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [venue, setVenue] = useState(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (venue_id) {
      fetchVenue(venue_id);
    } else if (router.isReady && !venue_id) {
      setLoading(false);
    }
  }, [venue_id, router.isReady]);

  async function fetchVenue(id) {
    try {
      const res = await fetch(`/api/commander/venues/${id}`);
      const data = await res.json();
      if (data.success && data.data.venue) {
        // Verify this venue has commander enabled
        if (data.data.venue.commander_enabled) {
          setVenue(data.data.venue);
        } else {
          setError('This venue is not registered for Club Commander.');
        }
      } else {
        setError('Venue not found.');
      }
    } catch (err) {
      console.error('Failed to fetch venue:', err);
      setError('Failed to load venue.');
    } finally {
      setLoading(false);
    }
  }

  function handlePinInput(digit) {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => handleSubmit(newPin), 100);
      }
    }
  }

  function handleBackspace() {
    setPin(pin.slice(0, -1));
  }

  function handleClear() {
    setPin('');
  }

  async function handleSubmit(submitPin) {
    const pinToSubmit = submitPin || pin;
    if (pinToSubmit.length !== 4 || !venue) return;

    setVerifying(true);
    setError(null);

    try {
      const res = await fetch('/api/commander/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venue.id, pin_code: pinToSubmit })
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('commander_staff', JSON.stringify(data.data.staff));
        localStorage.setItem('commander_venue', JSON.stringify(venue));
        router.push('/commander/dashboard');
      } else {
        setError(data.error || 'Invalid PIN');
        setPin('');
      }
    } catch (err) {
      setError('Verification failed. Please try again.');
      setPin('');
    } finally {
      setVerifying(false);
    }
  }

  // No venue_id provided - show error/redirect
  if (!loading && !venue_id) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
        <Head>
          <title>Staff Login | Club Commander</title>
        </Head>
        <div className="bg-[#242526] rounded-xl p-8 max-w-md w-full text-center border border-[#3A3B3C]">
          <AlertCircle className="w-16 h-16 text-[#F02849] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#E4E6EB] mb-2">No Venue Specified</h1>
          <p className="text-[#B0B3B8] mb-6">
            Staff login requires a venue-specific link. Please contact your manager for the correct login URL.
          </p>
          <Link href="/commander/register" className="text-[#1877F2] hover:underline">
            Register a new venue →
          </Link>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
        <Head>
          <title>Staff Login | Club Commander</title>
        </Head>
        <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
      </div>
    );
  }

  // Error loading venue
  if (error && !venue) {
    return (
      <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
        <Head>
          <title>Staff Login | Club Commander</title>
        </Head>
        <div className="bg-[#242526] rounded-xl p-8 max-w-md w-full text-center border border-[#3A3B3C]">
          <AlertCircle className="w-16 h-16 text-[#F02849] mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#E4E6EB] mb-2">Error</h1>
          <p className="text-[#B0B3B8] mb-6">{error}</p>
          <Link href="/commander/register" className="text-[#1877F2] hover:underline">
            Register a new venue →
          </Link>
        </div>
      </div>
    );
  }

  // PIN entry for specific venue
  return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
      <Head>
        <title>Staff Login | {venue?.name} | Club Commander</title>
      </Head>

      <div className="bg-[#242526] rounded-xl p-8 max-w-md w-full border border-[#3A3B3C]">
        {/* Venue Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#1877F2] rounded-full flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[#E4E6EB]">{venue?.name}</h1>
          <p className="text-[#B0B3B8] text-sm mt-1">{venue?.city}, {venue?.state}</p>
          <p className="text-[#B0B3B8] mt-4">Enter your 4-digit staff PIN</p>
        </div>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-6">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-lg border-2 flex items-center justify-center text-2xl font-bold ${
                pin.length > i
                  ? 'bg-[#1877F2] border-[#1877F2] text-white'
                  : 'bg-[#3A3B3C] border-[#4E4F50] text-[#E4E6EB]'
              }`}
            >
              {pin.length > i ? '•' : ''}
            </div>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-[#F02849]/10 border border-[#F02849]/30 text-[#F02849] px-4 py-2 rounded-lg mb-4 text-center text-sm">
            {error}
          </div>
        )}

        {/* PIN Pad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <button
              key={digit}
              onClick={() => handlePinInput(String(digit))}
              disabled={verifying}
              className="h-14 rounded-lg bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] text-xl font-semibold transition-colors disabled:opacity-50"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={handleClear}
            disabled={verifying}
            className="h-14 rounded-lg bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#B0B3B8] text-sm font-medium transition-colors disabled:opacity-50"
          >
            Clear
          </button>
          <button
            onClick={() => handlePinInput('0')}
            disabled={verifying}
            className="h-14 rounded-lg bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] text-xl font-semibold transition-colors disabled:opacity-50"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            disabled={verifying}
            className="h-14 rounded-lg bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#B0B3B8] text-sm font-medium transition-colors disabled:opacity-50"
          >
            ←
          </button>
        </div>

        {/* Verifying indicator */}
        {verifying && (
          <div className="flex items-center justify-center gap-2 text-[#1877F2]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Verifying...</span>
          </div>
        )}
      </div>
    </div>
  );
}
