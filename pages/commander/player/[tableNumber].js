/**
 * Player Table Display + Dealer Scan-In
 * /commander/player/[tableNumber]
 * 
 * Player-facing screen mounted at the table or on a small tablet.
 * Shows ALL seated players at this table with their live countdown timers.
 * Players can see their own time + everyone else's time.
 * 
 * DEALER SCAN-IN:
 * - Shows current dealer in a banner below the header
 * - "Change Dealer" button opens camera QR scanner
 * - Dealer scans their member card QR to assign themselves to this table
 * 
 * No authentication required - read-only display + dealer scan-in.
 * Auto-refreshes every 3 seconds, timers tick locally every second.
 * 
 * Color coding:
 *   Green  = plenty of time (> 15 min)
 *   Yellow = running low (< 15 min)
 *   Red    = critical (< 5 min)
 *   Red pulse = expired (0:00)
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Script from 'next/script';

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) return '--:--';
  if (seconds <= 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getSeatPositions(count) {
  const positions = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    positions.push({ x: 50 + Math.cos(angle) * 42, y: 50 + Math.sin(angle) * 38, seat: i + 1 });
  }
  return positions;
}

function getTimeColor(seconds) {
  if (seconds === null || seconds === undefined) return '#3A3B3C';
  if (seconds <= 0) return '#EF4444';
  if (seconds <= 300) return '#EF4444';
  if (seconds <= 900) return '#F59E0B';
  return '#31A24C';
}

function formatDealerTime(startedAt) {
  if (!startedAt) return '';
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now - start;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just started';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

/* ── QR Scanner Modal ── */
function QRScannerModal({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    let animFrame;
    let active = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      } catch (err) {
        console.error('Camera error:', err);
        setError('Camera access denied. Please allow camera access to scan QR codes.');
        return;
      }

      // Scan loop
      const scan = () => {
        if (!active || !videoRef.current || !canvasRef.current) return;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          if (typeof window.jsQR === 'function') {
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });
            if (code?.data) {
              setScanning(false);
              onScan(code.data);
              return;
            }
          }
        }
        animFrame = requestAnimationFrame(scan);
      };

      // Wait for video to be ready
      if (videoRef.current) {
        videoRef.current.onloadeddata = () => {
          if (active) scan();
        };
      }
    };

    startCamera();

    return () => {
      active = false;
      if (animFrame) cancelAnimationFrame(animFrame);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [onScan]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <h2 style={{ color: '#fff', fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
        Scan Dealer Card
      </h2>
      <p style={{ color: '#B0B3B8', fontSize: '14px', marginBottom: '20px', textAlign: 'center' }}>
        Hold the employee card QR code in front of the camera
      </p>

      {error ? (
        <div style={{
          background: '#3A1010', border: '2px solid #EF4444', borderRadius: '12px',
          padding: '20px', color: '#EF4444', maxWidth: '400px', textAlign: 'center'
        }}>
          <p>{error}</p>
          <button onClick={onClose} style={{
            marginTop: '16px', padding: '10px 24px', background: '#EF4444',
            color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
            fontWeight: 600
          }}>Close</button>
        </div>
      ) : (
        <>
          <div style={{
            position: 'relative', width: '100%', maxWidth: '400px',
            aspectRatio: '4/3', borderRadius: '16px', overflow: 'hidden',
            border: scanning ? '3px solid #22D3EE' : '3px solid #31A24C'
          }}>
            <video
              ref={videoRef}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              playsInline
              muted
            />
            {/* Scan line animation */}
            {scanning && (
              <div style={{
                position: 'absolute', left: '10%', right: '10%', height: '2px',
                background: '#22D3EE', boxShadow: '0 0 8px #22D3EE',
                animation: 'scanLine 2s linear infinite'
              }} />
            )}
            {/* Corner guides */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100">
              <path d="M20 5 L5 5 L5 20" fill="none" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M80 5 L95 5 L95 20" fill="none" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M20 95 L5 95 L5 80" fill="none" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M80 95 L95 95 L95 80" fill="none" stroke="#22D3EE" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </>
      )}

      <button onClick={onClose} style={{
        marginTop: '24px', padding: '12px 32px', background: 'transparent',
        color: '#B0B3B8', border: '2px solid #3A3B3C', borderRadius: '10px',
        cursor: 'pointer', fontWeight: 600, fontSize: '16px'
      }}>Cancel</button>
    </div>
  );
}

export default function PlayerTableDisplay() {
  const router = useRouter();
  const { tableNumber } = router.query;
  const [players, setPlayers] = useState([]);
  const [table, setTable] = useState(null);
  const [now, setNow] = useState(new Date());
  const [dealer, setDealer] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState(null); // { type: 'success'|'error', message }
  const wakeLockRef = useRef(null);

  // Fetch all tablet data (table info, sessions, dealer) in one call
  useEffect(() => {
    if (!tableNumber) return;
    const fetchData = async () => {
      try {
        const venueParam = table?.venue_id ? `&venue_id=${table.venue_id}` : '';
        const res = await fetch(`/api/commander/dealer/tablet-data?table=${tableNumber}${venueParam}`);
        const json = await res.json();
        if (json.success) {
          setPlayers(json.data.players || []);
          setTable(json.data.table || null);
          setDealer(json.data.dealer || null);
        }
      } catch (err) { console.error(err); }
    };
    fetchData();
    const poll = setInterval(fetchData, 3000);
    return () => clearInterval(poll);
  }, [tableNumber, table?.venue_id]);

  // Local countdown ticker
  useEffect(() => {
    const ticker = setInterval(() => {
      setPlayers(prev => prev.map(p => ({
        ...p,
        time_remaining: p.time_remaining !== null && p.time_remaining !== undefined
          ? Math.max(0, p.time_remaining - 1) : null
      })));
      setNow(new Date());
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) { }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  // Handle QR scan result
  const handleScan = useCallback(async (qrData) => {
    setShowScanner(false);
    setScanStatus({ type: 'loading', message: 'Scanning...' });

    try {
      const res = await fetch('/api/commander/dealer/scan-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_code: qrData,
          table_number: parseInt(tableNumber),
          venue_id: table?.venue_id
        })
      });
      const json = await res.json();

      if (json.success) {
        setDealer(json.data.dealer);
        setScanStatus({ type: 'success', message: `${json.data.dealer.name} is now dealing` });
      } else {
        setScanStatus({ type: 'error', message: json.error || 'Scan failed' });
      }
    } catch (err) {
      setScanStatus({ type: 'error', message: 'Network error. Please try again.' });
    }

    // Clear status after 4 seconds
    setTimeout(() => setScanStatus(null), 4000);
  }, [tableNumber, table]);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const maxSeats = table?.max_seats || 9;
  const seatPositions = getSeatPositions(maxSeats);

  return (
    <>
      <Head>
        <title>Table {tableNumber} | Player View</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {/* jsQR library for QR code scanning */}
      <Script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js" strategy="beforeInteractive" />

      <style jsx global>{`
        body { overflow: hidden; }
        @keyframes pulse-expired { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .expired-pulse { animation: pulse-expired 1s ease-in-out infinite; }
        @keyframes ring-pulse { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.4); opacity: 0; } }
        @keyframes scanLine { 0% { top: 10%; } 100% { top: 90%; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div onClick={goFullscreen}
        className="h-screen bg-[#0A0A0A] text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-[#1877F2] px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Table {tableNumber}</h1>
            <span className="text-sm opacity-80">
              {table?.game_type || 'NLH'} {table?.stakes || ''} — {players.length}/{maxSeats}
            </span>
          </div>
          <p className="text-2xl font-mono font-bold tabular-nums">
            {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>

        {/* Dealer Banner */}
        <div style={{
          background: dealer ? '#1a2a1a' : '#1a1a2a',
          borderBottom: `2px solid ${dealer ? '#31A24C40' : '#22D3EE30'}`,
          padding: '8px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Dealer avatar/icon */}
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: dealer ? '#31A24C20' : '#22D3EE15',
              border: `2px solid ${dealer ? '#31A24C50' : '#22D3EE30'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden'
            }}>
              {dealer?.photo_url ? (
                <img src={dealer.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dealer ? '#31A24C' : '#22D3EE'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div>
              {dealer ? (
                <>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                    {dealer.name}
                  </p>
                  <p style={{ fontSize: '11px', color: '#B0B3B8', lineHeight: 1.2 }}>
                    Dealer · {formatDealerTime(dealer.started_at)}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '14px', color: '#888', fontWeight: 500 }}>No Dealer Assigned</p>
              )}
            </div>
          </div>

          <button
            onClick={(e) => { e.stopPropagation(); setShowScanner(true); }}
            style={{
              padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: 600, fontSize: '13px', border: 'none',
              background: dealer ? '#3A3B3C' : '#22D3EE',
              color: dealer ? '#fff' : '#000',
              transition: 'all 0.2s'
            }}
          >
            {dealer ? 'Change Dealer' : 'Scan In'}
          </button>
        </div>

        {/* Scan Status Toast */}
        {scanStatus && (
          <div style={{
            position: 'absolute', top: '120px', left: '50%', transform: 'translateX(-50%)',
            padding: '12px 24px', borderRadius: '12px', zIndex: 100,
            background: scanStatus.type === 'success' ? '#1a3a1a' : scanStatus.type === 'error' ? '#3a1a1a' : '#1a1a3a',
            border: `2px solid ${scanStatus.type === 'success' ? '#31A24C' : scanStatus.type === 'error' ? '#EF4444' : '#22D3EE'}`,
            color: '#fff', fontWeight: 600, fontSize: '14px',
            animation: 'fadeIn 0.3s ease', whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}>
            {scanStatus.type === 'success' ? '✓ ' : scanStatus.type === 'error' ? '✗ ' : ''}
            {scanStatus.message}
          </div>
        )}

        {/* Main: Seat Map with Large Timers */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="relative w-full max-w-2xl" style={{ aspectRatio: '16/10' }}>

            {/* Table felt */}
            <div className="absolute inset-[10%] rounded-[50%] bg-[#1a3a1a]/30 border-2 border-[#2a5a2a]/40" />

            {/* Center label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-sm text-white/20 uppercase tracking-[0.3em]">T{tableNumber}</p>
            </div>

            {/* Seat positions */}
            {seatPositions.map(pos => {
              const player = players.find(p => p.seat_number === pos.seat);
              const t = player?.time_remaining;
              const color = getTimeColor(t);
              const isExpired = t !== null && t !== undefined && t <= 0;
              const isCritical = t !== null && t !== undefined && t <= 300 && t > 0;

              return (
                <div key={pos.seat} className="absolute flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}>

                  {!player ? (
                    /* Empty seat */
                    <div className="w-16 h-16 rounded-full bg-white/3 border border-white/8 flex items-center justify-center">
                      <span className="text-sm text-white/15">{pos.seat}</span>
                    </div>
                  ) : (
                    /* Occupied seat with timer */
                    <>
                      <div className={`relative w-16 h-16 rounded-full flex items-center justify-center border-2 ${isExpired ? 'expired-pulse' : ''}`}
                        style={{ backgroundColor: `${color}15`, borderColor: `${color}60` }}>

                        {/* Timer */}
                        <span className="text-base font-mono font-bold" style={{ color }}>
                          {isExpired ? 'OUT' : formatCountdown(t)}
                        </span>

                        {/* Critical ring animation */}
                        {isCritical && (
                          <div className="absolute inset-0 rounded-full border-2 opacity-0"
                            style={{ borderColor: color, animation: 'ring-pulse 1.5s ease-out infinite' }} />
                        )}
                      </div>

                      {/* Player name */}
                      <span className="text-xs text-white/70 mt-1 max-w-[80px] truncate text-center font-medium">
                        {player.player_name}
                      </span>

                      {/* Seat number */}
                      <span className="text-[9px] text-white/30">S{pos.seat}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Player List at bottom */}
        {players.length > 0 && (
          <div className="bg-[#111] border-t border-white/10 px-6 py-3">
            <div className="flex flex-wrap gap-4 justify-center">
              {players
                .sort((a, b) => (a.time_remaining ?? Infinity) - (b.time_remaining ?? Infinity))
                .map(p => {
                  const t = p.time_remaining;
                  const color = getTimeColor(t);
                  const isExpired = t !== null && t !== undefined && t <= 0;
                  return (
                    <div key={p.session_id || p.seat_number}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl ${isExpired ? 'expired-pulse' : ''}`}
                      style={{ backgroundColor: `${color}10`, border: `2px solid ${color}30` }}>
                      <span className="text-xs text-white/50">S{p.seat_number}</span>
                      <span className="text-sm font-medium text-white">{p.player_name?.split(' ')[0]}</span>
                      <span className="text-lg font-mono font-bold" style={{ color }}>
                        {isExpired ? 'EXPIRED' : formatCountdown(t)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Branding */}
        <div className="flex-shrink-0 py-1 text-center">
          <p className="text-white/10 text-[10px] tracking-wider">Powered by Smarter.Poker</p>
        </div>
      </div>

      {/* QR Scanner Modal */}
      {showScanner && (
        <QRScannerModal
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
