/**
 * Dealer Tablet - Complete Table Management
 * /commander/dealer/[tableNumber]
 * 
 * Flow:
 * 1. Dealer taps empty seat → QR scanner opens
 * 2. Scan player's member QR code (CMD-xxxx-xxxxxxxx)
 * 3. System checks: active membership + time balance on account
 * 4. If valid → player seated, countdown timer starts
 * 5. All seated players show live countdown timers
 * 6. Low time warnings (< 15 min = yellow, < 5 min = red pulse)
 * 7. Dealer can add time, request floor, track hands
 * 
 * Designed for tablet mounted at dealer position
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  AlertTriangle, Coffee, Hash, Loader2, RefreshCw,
  UserX, UserPlus, Clock, Bell, RotateCcw, ScanLine,
  Camera, X, CheckCircle2, Shield, Timer, Plus, DollarSign,
  ChevronUp, AlertCircle, User
} from 'lucide-react';

const TIER_COLORS = { standard: '#B0B3B8', gold: '#F59E0B', platinum: '#94A3B8', vip: '#A855F7' };

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
    positions.push({ x: 50 + Math.cos(angle) * 42, y: 50 + Math.sin(angle) * 35, seat: i + 1 });
  }
  return positions;
}

export default function DealerTablet() {
  const router = useRouter();
  const { tableNumber } = router.query;
  const [table, setTable] = useState(null);
  const [seatedPlayers, setSeatedPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [handCount, setHandCount] = useState(0);
  const [floorRequested, setFloorRequested] = useState(false);
  const [breakTimer, setBreakTimer] = useState(null);
  const [breakSeconds, setBreakSeconds] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [targetSeat, setTargetSeat] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedMember, setScannedMember] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const [addTimePlayer, setAddTimePlayer] = useState(null);
  const [addTimeMinutes, setAddTimeMinutes] = useState('60');
  const [addingTime, setAddingTime] = useState(false);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  const fetchTable = useCallback(async () => {
    if (!tableNumber) return;
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [tableRes, sessionsRes] = await Promise.all([
        fetch(`/api/commander/tables/${tableNumber}`, { headers }),
        fetch(`/api/commander/dealer/sessions?table=${tableNumber}`, { headers })
      ]);
      const tableJson = await tableRes.json();
      const sessionsJson = await sessionsRes.json();
      if (tableJson.success) setTable(tableJson.data);
      if (sessionsJson.success) setSeatedPlayers(sessionsJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [tableNumber]);

  useEffect(() => { fetchTable(); const i = setInterval(fetchTable, 10000); return () => clearInterval(i); }, [fetchTable]);

  // Countdown ticker - every second
  useEffect(() => {
    const ticker = setInterval(() => {
      setSeatedPlayers(prev => prev.map(p => ({
        ...p,
        time_remaining: p.time_remaining !== null && p.time_remaining !== undefined
          ? Math.max(0, p.time_remaining - 1) : null
      })));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // Break timer
  useEffect(() => {
    if (!breakTimer) return;
    const i = setInterval(() => setBreakSeconds(Math.floor((Date.now() - breakTimer) / 1000)), 1000);
    return () => clearInterval(i);
  }, [breakTimer]);

  const openScanner = (seatNum) => {
    setTargetSeat(seatNum); setScannerOpen(true); setScanError(''); setScannedMember(null); setManualCode('');
  };
  const closeScanner = () => {
    stopCamera(); setScannerOpen(false); setTargetSeat(null); setScannedMember(null); setScanError(''); setManualCode('');
  };

  const startCamera = async () => {
    setScanError(''); setScannedMember(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setScanning(true);
      detectQR();
    } catch { setScanError('Camera access denied. Use manual entry.'); }
  };

  const stopCamera = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScanning(false);
  };

  const detectQR = () => {
    if (!videoRef.current || videoRef.current.readyState !== 4) {
      animFrameRef.current = requestAnimationFrame(detectQR); return;
    }
    try {
      if ('BarcodeDetector' in window) {
        new BarcodeDetector({ formats: ['qr_code'] }).detect(videoRef.current).then(barcodes => {
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue;
            if (code.startsWith('CMD-') || code.includes('/check-in/')) {
              stopCamera(); lookupMember(code); return;
            }
          }
          animFrameRef.current = requestAnimationFrame(detectQR);
        }).catch(() => { animFrameRef.current = requestAnimationFrame(detectQR); });
      } else { animFrameRef.current = requestAnimationFrame(detectQR); }
    } catch { animFrameRef.current = requestAnimationFrame(detectQR); }
  };

  const lookupMember = async (qrCode) => {
    setScanLoading(true); setScanError('');
    try {
      const token = getToken();
      const res = await fetch('/api/commander/dealer/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ qr_code: qrCode, table_number: parseInt(tableNumber) })
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Member not found');
      setScannedMember(json.data);
    } catch (err) { setScanError(err.message); }
    finally { setScanLoading(false); }
  };

  const seatPlayer = async () => {
    if (!scannedMember || !targetSeat) return;
    setScanLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/commander/dealer/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          member_id: scannedMember.member.id,
          table_number: parseInt(tableNumber),
          seat_number: targetSeat,
          time_minutes: scannedMember.time_balance_minutes || 0
        })
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to seat player');
      closeScanner(); await fetchTable();
    } catch (err) { setScanError(err.message); }
    finally { setScanLoading(false); }
  };

  const removePlayer = async (sessionId) => {
    try {
      const token = getToken();
      await fetch(`/api/commander/dealer/sessions/${sessionId}/end`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }
      });
      await fetchTable();
    } catch (err) { console.error(err); }
  };

  const addTime = async () => {
    if (!addTimePlayer) return;
    setAddingTime(true);
    try {
      const token = getToken();
      await fetch(`/api/commander/dealer/sessions/${addTimePlayer.session_id}/add-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ minutes: parseInt(addTimeMinutes) || 60 })
      });
      setAddTimePlayer(null); await fetchTable();
    } catch (err) { console.error(err); }
    finally { setAddingTime(false); }
  };

  const requestFloor = async () => {
    setFloorRequested(true);
    try {
      const token = getToken();
      await fetch('/api/commander/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: 'floor_call', table_number: parseInt(tableNumber), description: `Floor requested at Table ${tableNumber}`, priority: 'normal' })
      });
    } catch (err) { console.error(err); }
    setTimeout(() => setFloorRequested(false), 30000);
  };

  if (loading) return <div className="min-h-screen bg-[#18191A] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>;

  const maxSeats = table?.max_seats || 9;
  const seatPositions = getSeatPositions(maxSeats);
  const lowTimePlayers = seatedPlayers.filter(p => p.time_remaining !== null && p.time_remaining > 0 && p.time_remaining <= 900);

  return (
    <>
      <Head><title>Table {tableNumber} | Dealer Tablet</title></Head>
      <style jsx global>{`
        @keyframes pulse-warn { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .time-warn { animation: pulse-warn 1.5s ease-in-out infinite; }
      `}</style>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter'] flex flex-col">
        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-white">Table {tableNumber}</h1>
            <p className="text-xs text-[#B0B3B8]">{table?.game_type || 'NLH'} — {table?.stakes || '$1/$2'} — {seatedPlayers.length}/{maxSeats}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="bg-[#3A3B3C] rounded-lg px-3 py-1.5 flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-[#B0B3B8]" />
              <span className="text-sm font-mono font-bold text-white">{handCount}</span>
            </div>
            <button onClick={fetchTable} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
          </div>
        </div>

        {/* Low Time Alert Banner */}
        {lowTimePlayers.length > 0 && (
          <div className="bg-[#F59E0B]/10 border-b border-[#F59E0B]/30 px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F59E0B]" />
            <p className="text-sm text-[#F59E0B]">
              {lowTimePlayers.map(p => `S${p.seat_number} ${p.player_name?.split(' ')[0]} (${formatCountdown(p.time_remaining)})`).join(' — ')}
            </p>
          </div>
        )}

        {/* SEAT MAP */}
        <div className="flex-1 relative p-4 overflow-hidden">
          <div className="relative w-full max-w-lg mx-auto" style={{ aspectRatio: '4/3' }}>
            <div className="absolute inset-[12%] rounded-[50%] bg-[#31A24C]/8 border-2 border-[#31A24C]/20" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
              <p className="text-xs text-[#B0B3B8] uppercase tracking-wider">T{tableNumber}</p>
              {breakTimer && <p className="text-lg font-mono font-bold text-[#F59E0B]">Break {Math.floor(breakSeconds / 60)}:{(breakSeconds % 60).toString().padStart(2, '0')}</p>}
            </div>
            {seatPositions.map(pos => {
              const player = seatedPlayers.find(p => p.seat_number === pos.seat);
              const isEmpty = !player;
              const t = player?.time_remaining;
              const isLow = t !== null && t !== undefined && t <= 900 && t > 0;
              const isCritical = t !== null && t !== undefined && t <= 300 && t > 0;
              const isExpired = t !== null && t !== undefined && t <= 0;
              return (
                <div key={pos.seat} className="absolute flex flex-col items-center"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}>
                  {isEmpty ? (
                    <button onClick={() => openScanner(pos.seat)}
                      className="w-14 h-14 rounded-full bg-[#3A3B3C]/50 border-2 border-dashed border-[#3A3B3C] flex items-center justify-center active:bg-[#3A3B3C]">
                      <ScanLine className="w-5 h-5 text-[#B0B3B8]" />
                    </button>
                  ) : (
                    <button onClick={() => setAddTimePlayer(player)}
                      className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${
                        isExpired ? 'bg-[#EF4444]/20 border-[#EF4444]/60 time-warn' :
                        isCritical ? 'bg-[#EF4444]/15 border-[#EF4444]/40 time-warn' :
                        isLow ? 'bg-[#F59E0B]/15 border-[#F59E0B]/40' :
                        'bg-[#1877F2]/20 border-[#1877F2]/40'
                      }`}>
                      <span className="text-sm font-bold text-white">{pos.seat}</span>
                    </button>
                  )}
                  {player && <span className="text-[9px] text-[#B0B3B8] mt-0.5 max-w-[70px] truncate text-center font-medium">{player.player_name?.split(' ')[0]}</span>}
                  {player && t !== null && t !== undefined && (
                    <span className={`text-[10px] font-mono font-bold ${isExpired ? 'text-[#EF4444] time-warn' : isCritical ? 'text-[#EF4444]' : isLow ? 'text-[#F59E0B]' : 'text-[#31A24C]'}`}>
                      {isExpired ? 'EXPIRED' : formatCountdown(t)}
                    </span>
                  )}
                  {player?.membership_tier && player.membership_tier !== 'standard' && (
                    <div className="w-2 h-2 rounded-full absolute -top-0.5 -right-0.5" style={{ backgroundColor: TIER_COLORS[player.membership_tier] || '#B0B3B8' }} />
                  )}
                  {isEmpty && <span className="text-[9px] text-[#B0B3B8]/50 mt-0.5">{pos.seat}</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Seated Players List */}
        {seatedPlayers.length > 0 && (
          <div className="bg-[#242526] border-t border-[#3A3B3C] px-4 py-2 max-h-36 overflow-y-auto">
            <div className="space-y-1">
              {seatedPlayers.sort((a, b) => (a.time_remaining ?? Infinity) - (b.time_remaining ?? Infinity)).map(player => {
                const t = player.time_remaining;
                const isLow = t !== null && t !== undefined && t <= 900 && t > 0;
                const isCritical = t !== null && t !== undefined && t <= 300 && t > 0;
                const isExpired = t !== null && t !== undefined && t <= 0;
                return (
                  <div key={player.session_id || player.seat_number}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isExpired ? 'bg-[#EF4444]/10' : isCritical ? 'bg-[#EF4444]/5' : isLow ? 'bg-[#F59E0B]/5' : 'bg-[#3A3B3C]/30'}`}>
                    <span className="text-xs text-[#B0B3B8] w-6">S{player.seat_number}</span>
                    <span className="text-sm text-white flex-1 truncate">{player.player_name}</span>
                    {player.membership_tier && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: (TIER_COLORS[player.membership_tier] || '#B0B3B8') + '20', color: TIER_COLORS[player.membership_tier] }}>
                        {player.membership_tier?.toUpperCase()}
                      </span>
                    )}
                    <span className={`text-sm font-mono font-bold w-16 text-right ${isExpired ? 'text-[#EF4444] time-warn' : isCritical ? 'text-[#EF4444]' : isLow ? 'text-[#F59E0B]' : 'text-[#31A24C]'}`}>
                      {t === null || t === undefined ? '--:--' : isExpired ? 'OUT' : formatCountdown(t)}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); setAddTimePlayer(player); }}
                      className="w-7 h-7 rounded-full bg-[#31A24C]/10 flex items-center justify-center active:bg-[#31A24C]/20">
                      <Plus className="w-3.5 h-3.5 text-[#31A24C]" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); removePlayer(player.session_id); }}
                      className="w-7 h-7 rounded-full bg-[#EF4444]/10 flex items-center justify-center active:bg-[#EF4444]/20">
                      <UserX className="w-3.5 h-3.5 text-[#EF4444]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="bg-[#242526] border-t border-[#3A3B3C] px-4 py-3 space-y-2 flex-shrink-0">
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setHandCount(h => h + 1)} className="py-4 rounded-xl bg-[#1877F2] text-white text-sm font-semibold flex items-center justify-center gap-2 active:bg-[#1565D8]"><Hash className="w-5 h-5" /> Hand +1</button>
            <button onClick={requestFloor} disabled={floorRequested}
              className={`py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${floorRequested ? 'bg-[#F59E0B] text-white animate-pulse' : 'bg-[#EF4444] text-white active:bg-[#DC2626]'}`}>
              <Bell className="w-5 h-5" /> {floorRequested ? 'Called' : 'Floor!'}
            </button>
            <button onClick={() => setBreakTimer(breakTimer ? null : Date.now())}
              className={`py-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 ${breakTimer ? 'bg-[#F59E0B] text-white' : 'bg-[#3A3B3C] text-[#E4E6EB] active:bg-[#4A4B4C]'}`}>
              <Coffee className="w-5 h-5" /> {breakTimer ? 'On Break' : 'Break'}
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setHandCount(0)} className="flex-1 py-2.5 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-medium flex items-center justify-center gap-1 active:bg-[#4A4B4C]"><RotateCcw className="w-3.5 h-3.5" /> Reset</button>
            <button onClick={() => router.push('/commander/poker-room')} className="flex-1 py-2.5 rounded-lg bg-[#3A3B3C] text-[#B0B3B8] text-xs font-medium active:bg-[#4A4B4C]">Exit</button>
          </div>
        </div>

        {/* QR SCANNER MODAL */}
        {scannerOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center" onClick={closeScanner}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between z-10">
                <div><h3 className="text-lg font-bold text-white">Scan Player — Seat {targetSeat}</h3><p className="text-xs text-[#B0B3B8]">Scan member QR code</p></div>
                <button onClick={closeScanner} className="p-2 rounded-lg active:bg-[#3A3B3C]"><X className="w-5 h-5 text-[#B0B3B8]" /></button>
              </div>
              <div className="p-4 space-y-4">
                {scanError && <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4 text-[#EF4444] flex-shrink-0" /><p className="text-sm text-[#EF4444]">{scanError}</p></div>}
                {scanLoading && <div className="text-center py-8"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin mx-auto mb-2" /><p className="text-sm text-[#B0B3B8]">Checking membership...</p></div>}
                {scannedMember && !scanLoading && (
                  <div className="space-y-3">
                    <div className="bg-[#18191A] rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-full bg-[#3A3B3C] flex items-center justify-center"><User className="w-6 h-6 text-[#B0B3B8]" /></div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-white">{scannedMember.member?.first_name} {scannedMember.member?.last_name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-[#1877F2]">{scannedMember.member?.member_number}</span>
                            {scannedMember.member?.membership_tier && (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                style={{ backgroundColor: (TIER_COLORS[scannedMember.member.membership_tier] || '#B0B3B8') + '20', color: TIER_COLORS[scannedMember.member.membership_tier] }}>
                                {scannedMember.member.membership_tier?.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`p-3 rounded-xl flex items-center gap-2 ${scannedMember.membership_active ? 'bg-[#31A24C]/10' : 'bg-[#EF4444]/10'}`}>
                          <Shield className={`w-5 h-5 ${scannedMember.membership_active ? 'text-[#31A24C]' : 'text-[#EF4444]'}`} />
                          <div><p className={`text-sm font-bold ${scannedMember.membership_active ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>{scannedMember.membership_active ? 'ACTIVE' : 'INACTIVE'}</p><p className="text-[10px] text-[#B0B3B8]">Membership</p></div>
                        </div>
                        <div className={`p-3 rounded-xl flex items-center gap-2 ${(scannedMember.time_balance_minutes || 0) > 0 ? 'bg-[#31A24C]/10' : 'bg-[#EF4444]/10'}`}>
                          <Timer className={`w-5 h-5 ${(scannedMember.time_balance_minutes || 0) > 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`} />
                          <div><p className={`text-sm font-bold ${(scannedMember.time_balance_minutes || 0) > 0 ? 'text-[#31A24C]' : 'text-[#EF4444]'}`}>{scannedMember.time_balance_minutes || 0} MIN</p><p className="text-[10px] text-[#B0B3B8]">Time Balance</p></div>
                        </div>
                      </div>
                    </div>
                    {!scannedMember.membership_active ? (
                      <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-xl p-4 text-center">
                        <p className="text-[#EF4444] font-medium">Membership not active</p>
                        <p className="text-xs text-[#B0B3B8] mt-1">Player needs to renew at the front desk</p>
                      </div>
                    ) : (scannedMember.time_balance_minutes || 0) <= 0 ? (
                      <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl p-4 text-center">
                        <p className="text-[#F59E0B] font-medium">No time on card</p>
                        <p className="text-xs text-[#B0B3B8] mt-1">Player needs to add time at the front desk</p>
                      </div>
                    ) : (
                      <button onClick={seatPlayer} className="w-full py-4 rounded-xl bg-[#31A24C] text-white text-lg font-semibold flex items-center justify-center gap-2 active:bg-[#28883F]">
                        <CheckCircle2 className="w-5 h-5" /> Seat at S{targetSeat} — {scannedMember.time_balance_minutes} min
                      </button>
                    )}
                    <button onClick={() => { setScannedMember(null); startCamera(); }} className="w-full py-2 text-[#1877F2] text-sm font-medium">Scan Different Player</button>
                  </div>
                )}
                {!scannedMember && !scanLoading && (
                  <>
                    {scanning ? (
                      <div className="space-y-3">
                        <div className="relative rounded-xl overflow-hidden bg-black">
                          <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-[4/3]" />
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="w-48 h-48 border-2 border-[#1877F2] rounded-xl animate-pulse" /></div>
                        </div>
                        <p className="text-center text-sm text-[#B0B3B8]">Hold QR code in view</p>
                        <button onClick={stopCamera} className="w-full py-2.5 bg-[#3A3B3C] text-[#B0B3B8] rounded-lg text-sm font-medium active:bg-[#4A4B4C]">Stop Camera</button>
                      </div>
                    ) : (
                      <button onClick={startCamera} className="w-full py-10 border-2 border-dashed border-[#3A3B3C] rounded-xl flex flex-col items-center gap-3 active:border-[#1877F2]">
                        <Camera className="w-10 h-10 text-[#B0B3B8]" />
                        <span className="text-sm font-medium text-[#E4E6EB]">Open Camera to Scan</span>
                      </button>
                    )}
                    <div className="border-t border-[#3A3B3C] pt-4">
                      <p className="text-xs text-[#B0B3B8] mb-2">Or enter code manually:</p>
                      <div className="flex gap-2">
                        <input type="text" value={manualCode} onChange={e => setManualCode(e.target.value)} placeholder="CMD-1996-abc12345"
                          className="flex-1 px-3 py-2.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg text-[#E4E6EB] text-sm focus:border-[#1877F2] focus:outline-none"
                          onKeyDown={e => e.key === 'Enter' && lookupMember(manualCode.trim())} />
                        <button onClick={() => lookupMember(manualCode.trim())} className="px-4 py-2.5 bg-[#1877F2] text-white rounded-lg text-sm font-medium active:bg-[#1565D8]">Look Up</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ADD TIME MODAL */}
        {addTimePlayer && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={() => setAddTimePlayer(null)}>
            <div className="bg-[#242526] rounded-t-2xl w-full max-w-lg p-5 space-y-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">S{addTimePlayer.seat_number} — {addTimePlayer.player_name}</h3>
              <p className="text-sm text-[#B0B3B8]">Current: <span className="font-mono font-bold text-white">{formatCountdown(addTimePlayer.time_remaining)}</span></p>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 120, 180].map(m => (
                  <button key={m} onClick={() => setAddTimeMinutes(String(m))}
                    className={`py-3 rounded-xl text-sm font-medium ${addTimeMinutes === String(m) ? 'bg-[#31A24C] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'}`}>
                    +{m >= 60 ? `${m/60}hr` : `${m}m`}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAddTimePlayer(null)} className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-[#E4E6EB] font-medium active:bg-[#4A4B4C]">Cancel</button>
                <button onClick={addTime} disabled={addingTime}
                  className="flex-1 py-3 rounded-xl bg-[#31A24C] text-white font-medium active:bg-[#28883F] disabled:opacity-50 flex items-center justify-center gap-2">
                  {addingTime ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Time
                </button>
              </div>
              <button onClick={() => removePlayer(addTimePlayer.session_id)}
                className="w-full py-3 rounded-xl bg-[#EF4444]/10 text-[#EF4444] text-sm font-medium active:bg-[#EF4444]/20 flex items-center justify-center gap-2">
                <UserX className="w-4 h-4" /> Remove Player
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
