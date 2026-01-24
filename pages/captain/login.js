/**
 * Captain Staff Login Page - PIN entry for terminal
 * Reference: IMPLEMENTATION_PHASES.md - Step 1.5
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { KeyRound, Loader2, AlertCircle } from 'lucide-react';

export default function CaptainLogin() {
  const router = useRouter();
  const { venue_id } = router.query;

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [venue, setVenue] = useState(null);

  useEffect(() => {
    if (venue_id) {
      fetchVenue();
    }
  }, [venue_id]);

  async function fetchVenue() {
    try {
      const res = await fetch(`/api/captain/venues/${venue_id}`);
      const data = await res.json();
      if (data.success) {
        setVenue(data.data.venue);
      }
    } catch (err) {
      console.error('Failed to fetch venue:', err);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (pin.length < 4) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/captain/staff/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id, pin_code: pin })
      });

      const data = await res.json();

      if (data.success && data.data.valid) {
        // Store staff session
        localStorage.setItem('captain_staff', JSON.stringify({
          ...data.data.staff,
          permissions: data.data.permissions,
          venue_id
        }));
        router.push(`/captain/dashboard?venue_id=${venue_id}`);
      } else {
        setError('Invalid PIN. Please try again.');
        setPin('');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handlePinInput(digit) {
    if (pin.length < 6) {
      setPin(prev => prev + digit);
      setError(null);
    }
  }

  function handleBackspace() {
    setPin(prev => prev.slice(0, -1));
  }

  function handleClear() {
    setPin('');
  }

  if (!venue_id) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-[#EF4444]" />
          <h1 className="text-xl font-semibold text-[#1F2937]">Venue Required</h1>
          <p className="text-[#6B7280] mt-2">Please access this page with a venue ID.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Staff Login | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-[#1877F2] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937]">Staff Login</h1>
            {venue && (
              <p className="text-[#6B7280] mt-1">{venue.name}</p>
            )}
          </div>

          {/* PIN Display */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 mb-4">
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
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
                  disabled={loading}
                  className="h-16 rounded-xl bg-[#F9FAFB] text-2xl font-semibold text-[#1F2937] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={handleClear}
                disabled={loading}
                className="h-16 rounded-xl bg-[#F9FAFB] text-sm font-medium text-[#6B7280] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => handlePinInput('0')}
                disabled={loading}
                className="h-16 rounded-xl bg-[#F9FAFB] text-2xl font-semibold text-[#1F2937] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                onClick={handleBackspace}
                disabled={loading}
                className="h-16 rounded-xl bg-[#F9FAFB] text-sm font-medium text-[#6B7280] hover:bg-[#E5E7EB] active:bg-[#D1D5DB] transition-colors disabled:opacity-50"
              >
                Back
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={pin.length < 4 || loading}
            className="w-full h-14 bg-[#1877F2] text-white rounded-xl font-semibold text-lg hover:bg-[#1664d9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Verifying...
              </>
            ) : (
              'Login'
            )}
          </button>
        </div>
      </div>
    </>
  );
}
