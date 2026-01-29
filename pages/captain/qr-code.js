/**
 * Venue QR Code Display Page
 * Staff can display QR code for player check-in
 * Dark industrial sci-fi gaming theme
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
      <div className="cap-page flex items-center justify-center">
        <div className="animate-pulse text-[#64748B]">Loading...</div>
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div
        className="min-h-screen bg-white flex flex-col items-center justify-center p-8 cursor-pointer"
        onClick={toggleFullscreen}
      >
        <h1 className="text-4xl font-bold text-[#22D3EE] mb-2">{venue?.name}</h1>
        <p className="text-xl text-[#64748B] mb-8">Scan to Check In</p>
        <img
          src={getQRCodeUrl(400)}
          alt="Check-in QR Code"
          className="w-96 h-96"
        />
        <p className="text-sm text-[#4A5E78] mt-8">Tap anywhere to exit fullscreen</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Check-In QR Code | {venue?.name || 'Captain'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Header */}
        <header className="cap-header-bar">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Check-In QR Code</h1>
                <p className="text-sm text-[#64748B]">{venue?.name}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          {/* QR Code Display */}
          <div className="cap-panel p-8 text-center">
            <div className="w-20 h-20 bg-[#22D3EE]/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <QrCode className="w-10 h-10 text-[#22D3EE]" />
            </div>

            <h2 className="text-xl font-bold text-white mb-2">
              Player Check-In
            </h2>
            <p className="text-[#64748B] mb-6">
              Display this QR code for players to scan and check in
            </p>

            {/* QR Code Image - keep white background for QR readability */}
            <div className="bg-white rounded-xl p-6 mb-6 inline-block">
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
            <div className="bg-[#0D192E] rounded-lg p-3 mb-6">
              <p className="text-xs text-[#64748B] mb-1">Check-in URL</p>
              <p className="text-sm text-white font-mono break-all">{qrUrl}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleDownload}
                className="cap-btn cap-btn-secondary flex items-center gap-2 px-6 py-3"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
              <button
                onClick={toggleFullscreen}
                className="cap-btn cap-btn-primary flex items-center gap-2 px-6 py-3"
              >
                <Maximize2 className="w-5 h-5" />
                Fullscreen
              </button>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-6 bg-[#22D3EE]/5 rounded-xl p-4">
            <h3 className="font-medium text-[#22D3EE] mb-2">Tips</h3>
            <ul className="text-sm text-[#64748B] space-y-1">
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
