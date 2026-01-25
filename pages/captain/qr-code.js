/**
 * Venue QR Code Display Page
 * Staff can display QR code for player check-in
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { QrCode, Download, Maximize2, Minimize2, ArrowLeft } from 'lucide-react';

export default function VenueQRCodePage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venue, setVenue] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }

      // Generate check-in URL
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const checkInUrl = `${baseUrl}/hub/captain/check-in/${staffData.venue_id}`;
      setQrUrl(checkInUrl);
    } catch (err) {
      router.push('/captain/login');
    }
  }, [router]);

  // Generate QR code using Google Charts API (simple, no dependencies)
  function getQRCodeUrl(size = 300) {
    if (!qrUrl) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=1877F2`;
  }

  function handleDownload() {
    const link = document.createElement('a');
    link.href = getQRCodeUrl(500);
    link.download = `${venue?.name || 'venue'}-checkin-qr.png`;
    link.click();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setFullscreen(true);
    } else {
      document.exitFullscreen();
      setFullscreen(false);
    }
  }

  useEffect(() => {
    function handleFullscreenChange() {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!staff) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="animate-pulse text-[#6B7280]">Loading...</div>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div
        className="min-h-screen bg-white flex flex-col items-center justify-center p-8 cursor-pointer"
        onClick={toggleFullscreen}
      >
        <h1 className="text-4xl font-bold text-[#1877F2] mb-2">{venue?.name}</h1>
        <p className="text-xl text-[#6B7280] mb-8">Scan to Check In</p>
        <img
          src={getQRCodeUrl(400)}
          alt="Check-in QR Code"
          className="w-96 h-96"
        />
        <p className="text-sm text-[#9CA3AF] mt-8">Tap anywhere to exit fullscreen</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Check-In QR Code | {venue?.name || 'Captain'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB]">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">Check-In QR Code</h1>
                <p className="text-sm text-[#6B7280]">{venue?.name}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          {/* QR Code Display */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
            <div className="w-20 h-20 bg-[#1877F2]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-[#1877F2]" />
            </div>

            <h2 className="text-xl font-bold text-[#1F2937] mb-2">
              Player Check-In
            </h2>
            <p className="text-[#6B7280] mb-6">
              Display this QR code for players to scan and check in
            </p>

            {/* QR Code Image */}
            <div className="bg-[#F9FAFB] rounded-xl p-6 mb-6 inline-block">
              {qrUrl ? (
                <img
                  src={getQRCodeUrl(250)}
                  alt="Check-in QR Code"
                  className="w-64 h-64 mx-auto"
                />
              ) : (
                <div className="w-64 h-64 bg-[#E5E7EB] animate-pulse rounded-lg" />
              )}
            </div>

            {/* URL Display */}
            <div className="bg-[#F3F4F6] rounded-lg p-3 mb-6">
              <p className="text-xs text-[#6B7280] mb-1">Check-in URL</p>
              <p className="text-sm text-[#1F2937] font-mono break-all">{qrUrl}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 border border-[#E5E7EB] rounded-lg font-medium text-[#1F2937] hover:bg-[#F3F4F6] transition-colors"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-6 py-3 bg-[#1877F2] text-white rounded-lg font-medium hover:bg-[#1664d9] transition-colors"
              >
                <Maximize2 className="w-5 h-5" />
                Fullscreen
              </button>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-6 bg-[#1877F2]/5 rounded-xl p-4">
            <h3 className="font-medium text-[#1877F2] mb-2">Tips</h3>
            <ul className="text-sm text-[#6B7280] space-y-1">
              <li>Display on a tablet near the entrance</li>
              <li>Print and post at the check-in desk</li>
              <li>Use fullscreen mode for TV displays</li>
              <li>Players need to be logged in to check in</li>
            </ul>
          </div>
        </main>
      </div>
    </>
  );
}
